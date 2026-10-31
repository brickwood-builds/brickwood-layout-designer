// Small items, setup markers, ride/building footprints, user shapes, groups and
// warning acknowledgements. Pure functions, like edits.ts.
import { newId, nowIso } from './ids';
import { findFreeSpot, isModule, itemsOnLevel, type Item, type SnapMode } from './edits';
import { footprint, snap } from './geometry';
import { SpatialIndex } from './spatial';
import { moduleDisplayName, type CanvasObject, type Project, type Shape } from './schema';
import type { LayoutWarning } from './validation';

export interface NewObject {
  levelId: string;
  type: CanvasObject['type'];
  name: string;
  width: number;
  depth: number;
  color: string;
  round?: boolean;
  markerKind?: string;
  catalogKey?: string;
  /** Where the centre should go (studs). */
  center: { x: number; y: number };
  /** Rides/buildings need their own space; small items may sit on modules. */
  findSpace?: boolean;
  /** Put it on this layer (otherwise the usual layer for its kind). */
  layerId?: string;
}

/**
 * Where new markers and items go unless the user picked a layer: "Markers & small items"
 * if there is one, else the top layer.
 */
export function defaultItemLayerId(p: Project): string {
  const layers = [...p.layers].sort((a, b) => a.order - b.order);
  return (layers.find((l) => /marker/i.test(l.name)) ?? layers[layers.length - 1]!).id;
}

export function addObject(p: Project, spec: NewObject, mode: SnapMode): { project: Project; id: string } {
  const at = spec.findSpace
    ? findFreeSpot(p, spec.levelId, spec.width, spec.depth, spec.center, mode)
    : { x: snap(spec.center.x - spec.width / 2, mode), y: snap(spec.center.y - spec.depth / 2, mode) };
  const object: CanvasObject = {
    id: newId(),
    levelId: spec.levelId,
    layerId: spec.layerId && p.layers.some((l) => l.id === spec.layerId) ? spec.layerId : defaultItemLayerId(p),
    type: spec.type,
    name: spec.name,
    x: at.x,
    y: at.y,
    width: spec.width,
    depth: spec.depth,
    rotation: 0,
    color: spec.color,
    notes: '',
    ...(spec.round ? { round: true } : {}),
    ...(spec.markerKind ? { markerKind: spec.markerKind } : {}),
    ...(spec.catalogKey ? { catalogKey: spec.catalogKey } : {}),
  };
  return { project: { ...p, objects: [...p.objects, object] }, id: object.id };
}

/** Change an object's size, keeping its centre. */
export function resizeObject(p: Project, id: string, width: number, depth: number, mode: SnapMode): Project {
  return {
    ...p,
    objects: p.objects.map((o) => {
      if (o.id !== id) return o;
      const f = footprint(o);
      const nf = footprint({ ...o, width, depth });
      return { ...o, width, depth, x: snap(f.x + f.width / 2 - nf.width / 2, mode), y: snap(f.y + f.depth / 2 - nf.depth / 2, mode) };
    }),
  };
}

/** Modules an item sits on (it may cross several; this is geometry, not ownership). */
export function modulesUnder(p: Project, item: Item): string[] {
  const mods = itemsOnLevel(p, item.levelId).filter(isModule).filter((m) => m.id !== item.id);
  const index = new SpatialIndex(mods);
  const byId = new Map(mods.map((m) => [m.id, m]));
  return index
    .overlapping(footprint(item))
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map(moduleDisplayName);
}

/** Add a reusable shape to the palette (its section follows its type). */
export function addShape(p: Project, s: Omit<Shape, 'id'>): { project: Project; id: string } {
  const shape: Shape = { ...s, id: newId(), name: s.name.trim() || 'Shape' };
  if (!shape.round) delete shape.round;
  return { project: { ...p, shapes: [...p.shapes, shape] }, id: shape.id };
}

/** Keep a placed item's size and colour in the palette. */
export function saveShape(p: Project, o: CanvasObject, name: string): { project: Project; id: string } {
  return addShape(p, { name: name.trim() || o.name, type: o.type, width: o.width, depth: o.depth, color: o.color, round: o.round });
}

export function deleteShape(p: Project, id: string): Project {
  return { ...p, shapes: p.shapes.filter((s) => s.id !== id) };
}

// ---------- Groups ----------

export function groupOf(p: Project, itemId: string) {
  return p.groups.find((g) => g.memberIds.includes(itemId));
}

/** Clicking a grouped item selects its whole group. */
export function expandToGroups(p: Project, ids: Iterable<string>): string[] {
  const out = new Set(ids);
  for (const g of p.groups) if (g.memberIds.some((id) => out.has(id))) for (const id of g.memberIds) out.add(id);
  return [...out];
}

/** Make a named group. Items leave any group they were in; groups left with one member dissolve. */
export function groupItems(p: Project, ids: string[], name: string): { project: Project; id: string } {
  const members = [...new Set(ids)];
  const set = new Set(members);
  const groups = p.groups
    .map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => !set.has(id)) }))
    .filter((g) => g.memberIds.length > 1);
  const id = newId();
  return { project: { ...p, groups: [...groups, { id, name: name.trim() || `Group ${p.groups.length + 1}`, memberIds: members }] }, id };
}

export function ungroup(p: Project, groupId: string): Project {
  return { ...p, groups: p.groups.filter((g) => g.id !== groupId) };
}

export function renameGroup(p: Project, groupId: string, name: string): Project {
  return { ...p, groups: p.groups.map((g) => (g.id === groupId && name.trim() ? { ...g, name: name.trim() } : g)) };
}

// ---------- Warning acknowledgements ----------

export const warningKey = (w: Pick<LayoutWarning, 'kind' | 'ids'>) => `${w.kind}:${[...w.ids].sort().join(',')}`;

/** Only physical warnings can be marked as intended; ID problems must be fixed. */
export const canAcknowledge = (w: LayoutWarning) => w.kind === 'overlap' || w.kind === 'overhang' || w.kind === 'clearance';

export function acknowledge(p: Project, w: LayoutWarning, note = ''): Project {
  const key = warningKey(w);
  if (p.acknowledgements.some((a) => a.key === key)) return p;
  return { ...p, acknowledgements: [...p.acknowledgements, { key, message: w.message, note, at: nowIso() }] };
}

export function unacknowledge(p: Project, key: string): Project {
  return { ...p, acknowledgements: p.acknowledgements.filter((a) => a.key !== key) };
}

export function splitWarnings(p: Project, warnings: LayoutWarning[]) {
  const keys = new Set(p.acknowledgements.map((a) => a.key));
  return {
    open: warnings.filter((w) => !keys.has(warningKey(w))),
    acknowledged: warnings.filter((w) => keys.has(warningKey(w))),
  };
}

// ---------- Items riding along with modules ----------

/**
 * Markers and small items sitting on a module that is being moved go with it: if the
 * balloon-pop game moves, its markers move too. An item belongs to the module under its
 * centre. Items on locked or hidden layers, or already in `ids`, are left alone.
 */
export function withCarriedItems(p: Project, ids: Iterable<string>): string[] {
  const set = new Set(ids);
  const moving = p.modules.filter((m) => set.has(m.id));
  if (moving.length === 0) return [...set];
  const editable = new Set(p.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  const rects = moving.map((m) => ({ levelId: m.levelId, r: footprint(m) }));
  for (const o of p.objects) {
    if (set.has(o.id) || o.type === 'footprint' || !editable.has(o.layerId)) continue;
    const f = footprint(o);
    const cx = f.x + f.width / 2;
    const cy = f.y + f.depth / 2;
    if (rects.some(({ levelId, r }) => levelId === o.levelId && cx > r.x && cx < r.x + r.width && cy > r.y && cy < r.y + r.depth)) set.add(o.id);
  }
  return [...set];
}

