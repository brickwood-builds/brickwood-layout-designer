// Pure editing operations. Each returns a new Project and never mutates its input,
// so the editor can keep earlier versions for undo.
import { newId } from './ids';
import { nextLabel } from './labels';
import { footprint, rectContains, snap, unionRect, type Rect } from './geometry';
import { SpatialIndex } from './spatial';
import { inchesToStuds } from './units';
import { MILS_SIZES, type CanvasObject, type Dimension, type Level, type MilsKind, type MilsModule, type Project, type Rotation, type Table } from './schema';

export type Item = MilsModule | CanvasObject;
export type SnapMode = Project['settings']['snap'];

export const isModule = (item: Item): item is MilsModule => 'kind' in item;

export function allItems(p: Project): Item[] {
  return [...p.modules, ...p.objects];
}

export function findItem(p: Project, id: string): Item | undefined {
  return p.modules.find((m) => m.id === id) ?? p.objects.find((o) => o.id === id);
}

export function itemsOnLevel(p: Project, levelId: string): Item[] {
  return allItems(p).filter((i) => i.levelId === levelId);
}

function mapItems(p: Project, ids: ReadonlySet<string>, fn: (item: Item) => Item): Project {
  return {
    ...p,
    modules: p.modules.map((m) => (ids.has(m.id) ? (fn(m) as MilsModule) : m)),
    objects: p.objects.map((o) => (ids.has(o.id) ? (fn(o) as CanvasObject) : o)),
  };
}

export function selectionBounds(p: Project, ids: Iterable<string>): Rect | null {
  const set = new Set(ids);
  return unionRect(allItems(p).filter((i) => set.has(i.id)).map(footprint));
}

export function moveItems(p: Project, ids: Iterable<string>, dx: number, dy: number): Project {
  if (dx === 0 && dy === 0) return p;
  return mapItems(p, new Set(ids), (i) => ({ ...i, x: i.x + dx, y: i.y + dy }));
}

export function setItemPosition(p: Project, id: string, x: number, y: number): Project {
  return mapItems(p, new Set([id]), (i) => ({ ...i, x, y }));
}

/**
 * Rotate the selection 90° clockwise (or counter-clockwise) as one block around its centre.
 * Relative positions are kept exactly; the block is then put back on the snap grid.
 */
export function rotateItems(p: Project, ids: Iterable<string>, direction: 1 | -1, mode: SnapMode): Project {
  const set = new Set(ids);
  const bounds = selectionBounds(p, set);
  if (!bounds) return p;
  const px = bounds.x + bounds.width / 2;
  const py = bounds.y + bounds.depth / 2;
  const rotated = mapItems(p, set, (i) => {
    const f = footprint(i);
    const cx = f.x + f.width / 2;
    const cy = f.y + f.depth / 2;
    // Y points down, so clockwise is (x, y) -> (-y, x) relative to the pivot.
    const ncx = direction === 1 ? px - (cy - py) : px + (cy - py);
    const ncy = direction === 1 ? py + (cx - px) : py - (cx - px);
    const rotation = ((((i.rotation + direction * 90) % 360) + 360) % 360) as Rotation;
    const nf = footprint({ ...i, rotation });
    return { ...i, rotation, x: ncx - nf.width / 2, y: ncy - nf.depth / 2 };
  });
  const nb = selectionBounds(rotated, set)!;
  return moveItems(rotated, set, snap(nb.x, mode) - nb.x, snap(nb.y, mode) - nb.y);
}

/** Deleting a labelled module keeps its ID reserved: the plate still exists. */
export function deleteItems(p: Project, ids: Iterable<string>): Project {
  const set = new Set(ids);
  const known = new Set(p.storedLabels.map((l) => l.toUpperCase()));
  const freed = p.modules
    .filter((m) => set.has(m.id) && m.label.trim() && !known.has(m.label.trim().toUpperCase()))
    .map((m) => m.label.trim());
  return {
    ...p,
    storedLabels: freed.length ? [...p.storedLabels, ...freed] : p.storedLabels,
    modules: p.modules.filter((m) => !set.has(m.id)),
    objects: p.objects.filter((o) => !set.has(o.id)),
    // A group left with fewer than two members is no longer a group.
    groups: p.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => !set.has(id)) })).filter((g) => g.memberIds.length > 1),
  };
}

export function updateModule(p: Project, id: string, patch: Partial<Omit<MilsModule, 'id'>>): Project {
  return { ...p, modules: p.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

export function updateObject(p: Project, id: string, patch: Partial<Omit<CanvasObject, 'id'>>): Project {
  return { ...p, objects: p.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
}

/** Change a module's size, keeping its centre where it was. */
export function resizeModule(p: Project, id: string, kind: MilsKind, width: number, depth: number, mode: SnapMode): Project {
  const m = p.modules.find((x) => x.id === id);
  if (!m) return p;
  const f = footprint(m);
  const nf = footprint({ ...m, width, depth });
  const x = snap(f.x + f.width / 2 - nf.width / 2, mode);
  const y = snap(f.y + f.depth / 2 - nf.depth / 2, mode);
  return updateModule(p, id, { kind, width, depth, x, y });
}

/** Layer that new modules on a level go on: the one most of its modules use. */
function moduleLayerId(p: Project, levelId: string): string {
  const counts = new Map<string, number>();
  for (const m of p.modules) if (m.levelId === levelId) counts.set(m.layerId, (counts.get(m.layerId) ?? 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  return best?.[0] ?? [...p.layers].sort((a, b) => a.order - b.order)[0]!.id;
}

/**
 * Upper-left position nearest `center` where a width × depth footprint overlaps nothing
 * on the level, preferring spots fully on a table. Falls back to the centre itself.
 */
export function findFreeSpot(p: Project, levelId: string, width: number, depth: number, center: { x: number; y: number }, mode: SnapMode) {
  const index = new SpatialIndex(itemsOnLevel(p, levelId).filter((i) => isModule(i) || i.type === 'footprint'));
  const tables = p.tables.filter((t) => t.levelId === levelId).map(footprint);
  const start = { x: snap(center.x - width / 2, mode), y: snap(center.y - depth / 2, mode) };
  const step = 8; // half a 16-stud module: fine enough to find gaps, cheap enough to search
  let offTable: { x: number; y: number } | null = null;
  for (let ring = 0; ring <= 60; ring++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let gx = -ring; gx <= ring; gx++) {
      for (let gy = -ring; gy <= ring; gy++) {
        if (Math.max(Math.abs(gx), Math.abs(gy)) !== ring) continue;
        const r = { x: start.x + gx * step, y: start.y + gy * step, width, depth };
        if (index.overlapping(r).length > 0) continue;
        if (tables.length && !tables.some((t) => rectContains(t, r))) {
          offTable ??= { x: r.x, y: r.y };
          continue;
        }
        const d = Math.hypot(gx, gy);
        if (!best || d < best.d) best = { x: r.x, y: r.y, d };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return offTable ?? start;
}

export interface NewModule {
  levelId: string;
  kind: MilsKind;
  width?: number;
  depth?: number;
  center: { x: number; y: number };
  /** Place exactly at `center` (dropped by the user) instead of searching for free space. */
  exact?: boolean;
  /** A named base (ride or building built on its own plate): no MILS ID. */
  name?: string;
  color?: string;
}

export function addModule(p: Project, spec: NewModule, mode: SnapMode): { project: Project; id: string } {
  // A standard kind may be given turned (e.g. 8×16 is a 16×8 plate standing upright).
  const size = spec.width && spec.depth ? { width: spec.width, depth: spec.depth } : spec.kind === 'custom' ? { width: 32, depth: 32 } : MILS_SIZES[spec.kind];
  const at = spec.exact
    ? { x: snap(spec.center.x - size.width / 2, mode), y: snap(spec.center.y - size.depth / 2, mode) }
    : findFreeSpot(p, spec.levelId, size.width, size.depth, spec.center, mode);
  const module: MilsModule = {
    id: newId(),
    levelId: spec.levelId,
    layerId: moduleLayerId(p, spec.levelId),
    kind: spec.kind,
    label: spec.name ? '' : nextLabel(p, spec.kind),
    name: spec.name ?? '',
    x: at.x,
    y: at.y,
    width: size.width,
    depth: size.depth,
    rotation: 0,
    notes: '',
    ...(spec.color ? { color: spec.color } : {}),
  };
  return { project: { ...p, modules: [...p.modules, module] }, id: module.id };
}

/**
 * Insert copies of `sources` shifted by dx/dy onto `levelId`. Copies get new IDs;
 * labelled modules get the next free MILS IDs (a copy is a different physical plate).
 */
export function insertCopies(p: Project, sources: Item[], levelId: string, dx: number, dy: number): { project: Project; ids: string[] } {
  const taken = new Set<string>();
  const modules: MilsModule[] = [];
  const objects: CanvasObject[] = [];
  const newIds = new Map<string, string>();
  const level = p.levels.find((l) => l.id === levelId);
  for (const s of sources) {
    const layerId = p.layers.some((l) => l.id === s.layerId) ? s.layerId : p.layers[0]!.id;
    const base = { ...structuredClone(s), id: newId(), levelId: level ? levelId : s.levelId, layerId, x: s.x + dx, y: s.y + dy };
    newIds.set(s.id, base.id);
    if (isModule(s)) {
      const label = s.label.trim() ? nextLabel(p, s.kind, taken) || '' : '';
      if (label) taken.add(label);
      modules.push({ ...(base as MilsModule), label });
    } else {
      objects.push(base as CanvasObject);
    }
  }
  // Groups copied whole come along as new groups.
  const groups = p.groups
    .filter((g) => g.memberIds.every((id) => newIds.has(id)))
    .map((g) => ({ id: newId(), name: `${g.name} (copy)`, memberIds: g.memberIds.map((id) => newIds.get(id)!) }));
  return {
    project: { ...p, modules: [...p.modules, ...modules], objects: [...p.objects, ...objects], groups: [...p.groups, ...groups] },
    ids: [...modules, ...objects].map((i) => i.id),
  };
}

export function duplicateItems(p: Project, ids: Iterable<string>): { project: Project; ids: string[] } {
  const set = new Set(ids);
  const sources = allItems(p).filter((i) => set.has(i.id));
  const bounds = unionRect(sources.map(footprint));
  if (!bounds || sources.length === 0) return { project: p, ids: [] };
  // Place the copy directly to the right of the original block.
  return insertCopies(p, sources, sources[0]!.levelId, bounds.width, 0);
}

export interface LevelInput {
  name: string;
  elevationIn: number;
  tableWidthIn: number;
  tableDepthIn: number;
}

export function addLevel(p: Project, input: LevelInput): { project: Project; id: string } {
  const id = newId();
  const level: Level = {
    id,
    name: input.name.trim() || `Level ${p.levels.length + 1}`,
    elevationIn: input.elevationIn,
    offsetX: 0,
    offsetY: 0,
    visible: true,
    order: Math.max(...p.levels.map((l) => l.order)) + 1,
  };
  const table: Table = {
    id: newId(),
    levelId: id,
    layerId: [...p.layers].sort((a, b) => a.order - b.order)[0]!.id,
    name: 'Shelf',
    x: 0,
    y: 0,
    width: inchesToStuds(input.tableWidthIn),
    depth: inchesToStuds(input.tableDepthIn),
    rotation: 0,
    notes: '',
  };
  return { project: { ...p, levels: [...p.levels, level], tables: [...p.tables, table] }, id };
}

export function updateLevel(p: Project, id: string, patch: Partial<Omit<Level, 'id'>>): Project {
  return { ...p, levels: p.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Only an empty level can be removed, and never the last one. */
export function canDeleteLevel(p: Project, id: string): boolean {
  return p.levels.length > 1 && !allItems(p).some((i) => i.levelId === id);
}

export function deleteLevel(p: Project, id: string): Project {
  if (!canDeleteLevel(p, id)) return p;
  return { ...p, levels: p.levels.filter((l) => l.id !== id), tables: p.tables.filter((t) => t.levelId !== id) };
}

/** Set (or create) the table of a level, sizes in inches. */
export function setLevelTable(p: Project, levelId: string, name: string, widthIn: number, depthIn: number): Project {
  const existing = p.tables.find((t) => t.levelId === levelId);
  const width = inchesToStuds(widthIn);
  const depth = inchesToStuds(depthIn);
  if (existing) {
    return { ...p, tables: p.tables.map((t) => (t.id === existing.id ? { ...t, name: name.trim() || t.name, width, depth } : t)) };
  }
  const table: Table = {
    id: newId(),
    levelId,
    layerId: [...p.layers].sort((a, b) => a.order - b.order)[0]!.id,
    name: name.trim() || 'Table',
    x: 0,
    y: 0,
    width,
    depth,
    rotation: 0,
    notes: '',
  };
  return { ...p, tables: [...p.tables, table] };
}

// ---------- Layers ----------

export function addLayer(p: Project, name: string): { project: Project; id: string } {
  const id = newId();
  const order = Math.max(...p.layers.map((l) => l.order)) + 1;
  return { project: { ...p, layers: [...p.layers, { id, name: name.trim() || `Layer ${p.layers.length + 1}`, visible: true, locked: false, order }] }, id };
}

export function updateLayer(p: Project, id: string, patch: Partial<Omit<Project['layers'][number], 'id'>>): Project {
  return { ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/** Only an empty layer can be removed, and never the last one. */
export function canDeleteLayer(p: Project, id: string): boolean {
  return p.layers.length > 1 && !allItems(p).some((i) => i.layerId === id) && !p.tables.some((t) => t.layerId === id);
}

export function deleteLayer(p: Project, id: string): Project {
  return canDeleteLayer(p, id) ? { ...p, layers: p.layers.filter((l) => l.id !== id) } : p;
}

export function moveToLayer(p: Project, ids: Iterable<string>, layerId: string): Project {
  if (!p.layers.some((l) => l.id === layerId)) return p;
  return mapItems(p, new Set(ids), (i) => ({ ...i, layerId }));
}

// ---------- Saved dimensions ----------

export function addDimension(p: Project, d: Omit<Dimension, 'id' | 'label'> & { label?: string }): { project: Project; id: string } {
  const id = newId();
  return { project: { ...p, dimensions: [...p.dimensions, { id, label: d.label ?? '', ...d }] }, id };
}

export function deleteDimension(p: Project, id: string): Project {
  return { ...p, dimensions: p.dimensions.filter((d) => d.id !== id) };
}

export const dimensionLength = (d: Pick<Dimension, 'x1' | 'y1' | 'x2' | 'y2'>) => Math.hypot(d.x2 - d.x1, d.y2 - d.y1);

/** Move a layer one step up (drawn later, on top) or down in the stacking order. */
export function moveLayer(p: Project, id: string, direction: 1 | -1): Project {
  const sorted = [...p.layers].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((l) => l.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sorted.length) return p;
  const a = sorted[i]!;
  const b = sorted[j]!;
  return { ...p, layers: p.layers.map((l) => (l.id === a.id ? { ...l, order: b.order } : l.id === b.id ? { ...l, order: a.order } : l)) };
}
