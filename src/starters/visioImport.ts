// Converts the owner's exported Visio drawings (docs/brickwood-visio-layouts.csv)
// into canonical projects. Visio: inches, shape centres, origin bottom-left, Y up.
// App: studs, upper-left corners, origin upper-left, Y down.
import { SCHEMA_VERSION, milsKindForSize, type CanvasObject, type MilsModule, type Project, type Rotation, type Table } from '../domain/schema';
import { DEFAULT_FEATURES, DEFAULT_SETTINGS, DEFAULT_TABLE_HEIGHT_IN } from '../domain/project';
import { stableId } from '../domain/stableId';
import { VISIO_STUDS_PER_INCH, inchesToStuds } from '../domain/units';
import type { MarkerKind } from '../domain/markers';

export interface VisioRow {
  display: string;
  label: string;
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  angleRad: number;
  fill: string;
}

export function parseVisioCsv(text: string): VisioRow[] {
  const rows: VisioRow[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    if (cells.length < 8) throw new Error(`Malformed CSV line: ${line}`);
    const [display, label, x, y, w, h, a, fill] = cells as [string, string, string, string, string, string, string, string];
    rows.push({
      display,
      label: label.trim(),
      xIn: Number(x),
      yIn: Number(y),
      wIn: Number(w),
      hIn: Number(h),
      angleRad: Number(a),
      fill: fill.trim().toLowerCase(),
    });
  }
  return rows;
}

export interface StarterSpec {
  key: string;
  display: string;
  name: string;
  description: string;
  table: { name: string; widthIn: number; depthIn: number; notes: string };
  /** Retired MILS labels that must never be reused. */
  retiredLabels: string[];
  /** An earlier drawing of the same display: its plates not in this layout are recorded as stored. */
  previousDisplay?: string;
  /** This display's own setup markers (each project has its own list). */
  markers?: MarkerKind[];
  /** Where the layout sits along the table: centred, or at the left end (built left to right). */
  align?: 'center' | 'left';
  /** Visio page size; shapes entirely off the page (leftovers) are left out. */
  pageIn?: { width: number; height: number };
  /** Ride power in volts by footprint name. */
  power: Record<string, number>;
  notes: Record<string, string>;
}

export interface ImportNote {
  label: string;
  message: string;
}

export interface StarterResult {
  project: Project;
  notes: ImportNote[];
}

const SIZE_PREFIX = /^(16x8|16x16|32x16|32x32)\s*\|\s*(.+)$/;
const KINGDOM_MODULE = /^[ABC]\d{2}-V$/;
const ATTRACTION_FILL = '#c05046';
const ITEM_COLOR = '#9aa0a6';

const cleanName = (s: string) => s.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
const toStuds = (inches: number) => Math.round(inches * VISIO_STUDS_PER_INCH);

/** Visio rotates counter-clockwise with Y up; the app rotates clockwise with Y down. */
function toRotation(angleRad: number): Rotation {
  const deg = Math.round((-angleRad * 180) / Math.PI / 90) * 90;
  return (((deg % 360) + 360) % 360) as Rotation;
}

type Classified =
  | { kind: 'module'; label: string; name: string; row: VisioRow }
  | { kind: 'footprint' | 'item'; name: string; row: VisioRow };

function classify(row: VisioRow, notes: ImportNote[]): Classified | null {
  if (row.wIn <= 0 || row.hIn <= 0) {
    notes.push({ label: row.label || '(unlabelled line)', message: 'Zero-size connector line in drawing; skipped.' });
    return null;
  }
  const sized = SIZE_PREFIX.exec(row.label);
  if (sized) {
    const parts = sized[2]!.split('|').map((s) => s.trim());
    let label = parts[parts.length - 1]!;
    const name = parts.slice(0, -1).join(' ');
    const undashed = /^([ABC])(\d{2})$/.exec(label);
    if (undashed) {
      const fixed = `${undashed[1]}-${undashed[2]}`;
      notes.push({ label: fixed, message: `Drawing label "${label}" normalised to "${fixed}" (A-xx/B-xx/C-xx convention).` });
      label = fixed;
    } else if (!/^[ABC]-\d{2}$/.test(label)) {
      notes.push({ label, message: `Label "${label}" does not follow the A-xx/B-xx/C-xx convention; kept as drawn.` });
    }
    return { kind: 'module', label, name, row };
  }
  if (KINGDOM_MODULE.test(row.label)) return { kind: 'module', label: row.label, name: '', row };
  if (row.fill === '#ffd965') {
    // Kingdom buildings are built directly on their plate: one unit, no plate ID needed.
    return { kind: 'module', label: '', name: cleanName(row.label), row };
  }
  // Rides are built on their own bases too: one unit, named, no plate ID.
  if (row.fill === ATTRACTION_FILL) return { kind: 'module', label: '', name: cleanName(row.label), row };
  notes.push({ label: row.label, message: 'Unfilled shape imported as a generic item.' });
  return { kind: 'item', name: cleanName(row.label), row };
}

/** Plate IDs in the previous drawing that the current layout no longer uses. */
function storedFrom(spec: StarterSpec, allRows: VisioRow[], placed: MilsModule[]): string[] {
  if (!spec.previousDisplay) return [];
  const inLayout = new Set(placed.map((m) => m.label));
  const scratch: ImportNote[] = [];
  const labels = allRows
    .filter((r) => r.display === spec.previousDisplay)
    .map((r) => classify(r, scratch))
    .flatMap((c) => (c?.kind === 'module' && c.label ? [c.label] : []));
  return [...new Set(labels)].filter((l) => !inLayout.has(l)).sort();
}

export function buildStarterProject(spec: StarterSpec, allRows: VisioRow[], createdAt: string): StarterResult {
  const notes: ImportNote[] = [];
  const rows = allRows.filter((r) => r.display === spec.display);
  if (rows.length === 0) throw new Error(`No rows for display ${spec.display}`);
  const page = spec.pageIn;
  const onPage = (r: VisioRow) => {
    if (!page) return true;
    const inside =
      r.xIn + r.wIn / 2 > 0 && r.xIn - r.wIn / 2 < page.width && r.yIn + r.hIn / 2 > 0 && r.yIn - r.hIn / 2 < page.height;
    if (!inside) notes.push({ label: r.label || '(unlabelled shape)', message: 'Shape is off the drawing page (leftover, not part of the layout); left out.' });
    return inside;
  };
  const shapes = rows
    .filter(onPage)
    .map((r) => classify(r, notes))
    .filter((c): c is Classified => c !== null);

  // Visual (rotated) box of each shape in Visio inches.
  const box = (r: VisioRow) => {
    const rot = toRotation(r.angleRad);
    const swap = rot === 90 || rot === 270;
    const w = swap ? r.hIn : r.wIn;
    const h = swap ? r.wIn : r.hIn;
    return { left: r.xIn - w / 2, top: r.yIn + h / 2, w, h, rot };
  };
  const boxes = shapes.map((s) => box(s.row));
  const minLeft = Math.min(...boxes.map((b) => b.left));
  const maxTop = Math.max(...boxes.map((b) => b.top));
  const layoutWidth = Math.max(...boxes.map((b) => toStuds(b.left - minLeft + b.w)));
  const layoutDepth = Math.max(...boxes.map((b) => toStuds(maxTop - b.top + b.h)));

  // Table uses exact physical scale; place the layout on it, on whole studs.
  const tableWidth = inchesToStuds(spec.table.widthIn);
  const tableDepth = inchesToStuds(spec.table.depthIn);
  // Left-aligned layouts keep the same edge margin at the left as front/back.
  const offsetY = Math.round((tableDepth - layoutDepth) / 2);
  const offsetX = spec.align === 'left' ? offsetY : Math.round((tableWidth - layoutWidth) / 2);

  const sid = (part: string) => stableId(`starter:${spec.key}:${part}`);
  const levelId = sid('level:main');
  const moduleLayer = sid('layer:modules');
  const attractionLayer = sid('layer:attractions');

  const table: Table = {
    id: sid('table:main'),
    levelId,
    layerId: moduleLayer,
    name: spec.table.name,
    x: 0,
    y: 0,
    width: tableWidth,
    depth: tableDepth,
    rotation: 0,
    notes: spec.table.notes,
  };

  const modules: MilsModule[] = [];
  const objects: CanvasObject[] = [];
  const seen = new Map<string, number>();
  shapes.forEach((s, i) => {
    const b = boxes[i]!;
    const width = toStuds(s.row.wIn);
    const depth = toStuds(s.row.hIn);
    const x = toStuds(b.left - minLeft) + offsetX;
    const y = toStuds(maxTop - b.top) + offsetY;
    if (s.kind === 'module') {
      const n = (seen.get(s.label || s.name) ?? 0) + 1;
      seen.set(s.label || s.name, n);
      const power = spec.power[s.name];
      modules.push({
        id: sid(`module:${s.label || s.name}${n > 1 ? `:${n}` : ''}`),
        levelId,
        layerId: moduleLayer,
        kind: milsKindForSize(width, depth),
        label: s.label,
        name: s.name,
        x,
        y,
        width,
        depth,
        rotation: b.rot,
        notes: s.label ? '' : [spec.notes[s.name], 'Built on its own base; moves as one unit.'].filter(Boolean).join(' '),
        color: s.row.fill || undefined,
        ...(power !== undefined ? { powerVolts: power } : {}),
      });
    } else {
      const n = (seen.get(s.name) ?? 0) + 1;
      seen.set(s.name, n);
      objects.push({
        id: sid(`object:${s.name}:${n}`),
        levelId,
        layerId: attractionLayer,
        type: s.kind,
        name: s.name,
        x,
        y,
        width,
        depth,
        rotation: b.rot,
        color: s.kind === 'footprint' ? ATTRACTION_FILL : ITEM_COLOR,
        notes: spec.notes[s.name] ?? '',
      });
    }
  });

  const project: Project = {
    schemaVersion: SCHEMA_VERSION,
    id: sid('project'),
    name: spec.name,
    description: spec.description,
    createdAt,
    updatedAt: createdAt,
    revision: 0,
    revisionId: sid('revision:0'),
    archived: false,
    origin: `starter:${spec.key}`,
    settings: { ...DEFAULT_SETTINGS },
    features: { ...DEFAULT_FEATURES },
    levels: [{ id: levelId, name: 'Main table', elevationIn: DEFAULT_TABLE_HEIGHT_IN, offsetX: 0, offsetY: 0, visible: true, order: 0 }],
    layers: [
      { id: moduleLayer, name: 'Table, modules & bases', visible: true, locked: false, order: 0 },
      { id: sid('layer:surface'), name: 'Surface details', visible: true, locked: false, order: 1 },
      { id: attractionLayer, name: 'Markers & small items', visible: true, locked: false, order: 2 },
    ],
    tables: [table],
    modules,
    objects,
    groups: [],
    retiredLabels: spec.retiredLabels,
    storedLabels: storedFrom(spec, allRows, modules),
    shapes: (spec.markers ?? []).map((m) => ({
      id: sid(`marker:${m.key}`),
      name: m.name,
      type: 'setupMarker' as const,
      width: m.width,
      depth: m.depth,
      color: m.color,
      ...(m.shape === 'round' ? { round: true } : {}),
    })),
    acknowledgements: [],
    dimensions: [],
  };
  return { project, notes };
}
