// Drawing tools (Phase 2): paint pieces into stud cells, e.g. a walkway of 1×1 round
// plates. A stroke becomes one undoable change.
import { newId } from './ids';
import { footprint, type Rect } from './geometry';
import { isModule } from './edits';
import type { CanvasObject, Project } from './schema';
import { SpatialIndex } from './spatial';

export interface Pt {
  x: number;
  y: number;
}

/** A piece-sized cell (upper-left corner, studs). */
export interface Cell {
  x: number;
  y: number;
}

export interface BrushSize {
  /** Size of one piece (studs). Cells are aligned to multiples of this. */
  cellW: number;
  cellD: number;
  /** Brush width across (studs). */
  width: number;
}

const key = (c: Cell) => `${c.x},${c.y}`;

/** Cells covered by a square brush centred on one point. */
function cellsAt(p: Pt, b: BrushSize, out: Map<string, Cell>) {
  const half = Math.max(b.width, Math.min(b.cellW, b.cellD)) / 2;
  const x0 = Math.floor((p.x - half) / b.cellW) * b.cellW;
  const y0 = Math.floor((p.y - half) / b.cellD) * b.cellD;
  for (let x = x0; x < p.x + half - 1e-9; x += b.cellW) {
    for (let y = y0; y < p.y + half - 1e-9; y += b.cellD) {
      const c = { x, y };
      out.set(key(c), c);
    }
  }
}

/** Cells along a path of pointer samples; fills between samples so fast strokes leave no gaps. */
export function cellsForPath(points: Pt[], b: BrushSize): Cell[] {
  const out = new Map<string, Cell>();
  const step = Math.min(b.cellW, b.cellD) / 2;
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (!prev) return cellsAt(p, b, out);
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / step));
    for (let k = 1; k <= n; k++) cellsAt({ x: prev.x + ((p.x - prev.x) * k) / n, y: prev.y + ((p.y - prev.y) * k) / n }, b, out);
  });
  return [...out.values()];
}

/** Cells along a straight line between two points. */
export const cellsForLine = (a: Pt, z: Pt, b: BrushSize) => cellsForPath([a, z], b);

/** Every cell in the box between two corners. */
export function cellsForBox(a: Pt, z: Pt, b: BrushSize): Cell[] {
  const out: Cell[] = [];
  const x0 = Math.floor(Math.min(a.x, z.x) / b.cellW) * b.cellW;
  const y0 = Math.floor(Math.min(a.y, z.y) / b.cellD) * b.cellD;
  const x1 = Math.max(a.x, z.x);
  const y1 = Math.max(a.y, z.y);
  for (let x = x0; x < x1 || x === x0; x += b.cellW) {
    for (let y = y0; y < y1 || y === y0; y += b.cellD) out.push({ x, y });
  }
  return out;
}

export interface PaintTemplate {
  type: CanvasObject['type'];
  name: string;
  width: number;
  depth: number;
  color: string;
  round?: boolean;
  smooth?: boolean;
  catalogKey?: string;
  markerKind?: string;
}

/** What to do where something is already on the layer: skip it, or stack on top (terrain). */
export type WhenTaken = 'skip' | 'stack';

/**
 * Place one piece in each cell. By default cells already taken on the same layer are
 * skipped, so painting over a walkway never doubles it up; with 'stack' the new pieces go
 * on top (with Heights on they sit one layer higher), for building up slopes and hills.
 * Within one stroke a cell is only ever used once.
 */
export function paintCells(project: Project, levelId: string, layerId: string, template: PaintTemplate, cells: Cell[], whenTaken: WhenTaken = 'skip'): { project: Project; ids: string[] } {
  const taken = new SpatialIndex(whenTaken === 'skip' ? project.objects.filter((o) => o.levelId === levelId && o.layerId === layerId) : []);
  const added: CanvasObject[] = [];
  for (const c of cells) {
    const r: Rect = { x: c.x, y: c.y, width: template.width, depth: template.depth };
    if (taken.overlapping(r).length) continue;
    const o: CanvasObject = {
      id: newId(),
      levelId,
      layerId,
      type: template.type,
      name: template.name,
      x: c.x,
      y: c.y,
      width: template.width,
      depth: template.depth,
      rotation: 0,
      color: template.color,
      notes: '',
      ...(template.round ? { round: true } : {}),
      ...(template.smooth ? { smooth: true } : {}),
      ...(template.catalogKey ? { catalogKey: template.catalogKey } : {}),
      ...(template.markerKind ? { markerKind: template.markerKind } : {}),
    };
    taken.insert(o);
    added.push(o);
  }
  if (!added.length) return { project, ids: [] };
  return { project: { ...project, objects: [...project.objects, ...added] }, ids: added.map((o) => o.id) };
}

/** Remove markers, items and pieces on the layer whose centre is inside a cell (eraser). */
export function eraseCells(project: Project, levelId: string, layerId: string, cells: Cell[], b: BrushSize): { project: Project; removed: number } {
  if (!cells.length) return { project, removed: 0 };
  const index = new SpatialIndex(cells.map((c) => ({ id: key(c), x: c.x, y: c.y, width: b.cellW, depth: b.cellD, rotation: 0 as const })));
  const gone = new Set<string>();
  for (const o of project.objects) {
    if (o.levelId !== levelId || o.layerId !== layerId || isModule(o) || o.type === 'footprint') continue;
    const f = footprint(o);
    const cx = f.x + f.width / 2;
    const cy = f.y + f.depth / 2;
    if (index.intersecting({ x: cx, y: cy, width: 0, depth: 0 }).length) gone.add(o.id);
  }
  if (!gone.size) return { project, removed: 0 };
  return {
    project: {
      ...project,
      objects: project.objects.filter((o) => !gone.has(o.id)),
      groups: project.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => !gone.has(id)) })).filter((g) => g.memberIds.length > 1),
    },
    removed: gone.size,
  };
}

/** Group identical pieces for lists (a walkway is "Plate Round 1×1, Tan × 400"). */
export function countPieces(objects: CanvasObject[]): { name: string; color: string; count: number }[] {
  const m = new Map<string, { name: string; color: string; count: number }>();
  for (const o of objects) {
    const k = `${o.name}|${o.color}`;
    const e = m.get(k) ?? { name: o.name, color: o.color, count: 0 };
    e.count++;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
