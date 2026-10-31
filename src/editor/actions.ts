// Editor commands shared by the toolbar, keyboard shortcuts and panels.
import { levelBounds, snap, unionRect, footprint } from '../domain/geometry';
import {
  findFreeSpot,
  addModule,
  allItems,
  deleteItems,
  duplicateItems,
  insertCopies,
  itemsOnLevel,
  moveItems,
  rotateItems,
} from '../domain/edits';
import type { MilsKind } from '../domain/schema';
import { cellsForPath, eraseCells, paintCells, type Cell, type Pt } from '../domain/brush';
import { drawCurve, reshapeCurve, splinePoints } from '../domain/curves';
import { paintTemplate } from './drawTool';
import { designSize, placeDesign, saveDesign } from '../domain/designs';
import { addObject, defaultItemLayerId, groupItems, ungroup, withCarriedItems, type NewObject } from '../domain/objects';
import type { EditorStore } from './store';
import { fitView, toWorld, zoomAt } from './view';

export function fitToLevel(store: EditorStore) {
  const { project, levelId, viewport } = store.getState();
  if (!viewport.width || !viewport.height) return;
  const b = levelBounds(project, levelId) ?? { x: 0, y: 0, width: 128, depth: 64 };
  store.getState().setView(fitView(b, viewport.width, viewport.height));
}

export function zoomBy(store: EditorStore, factor: number) {
  const { view, viewport } = store.getState();
  store.getState().setView(zoomAt(view, viewport.width / 2, viewport.height / 2, factor));
}

function viewCenter(store: EditorStore) {
  const { view, viewport } = store.getState();
  return toWorld(view, viewport.width / 2, viewport.height / 2);
}

/** Add a module at `at` (dropped there) or, without it, in free space near the middle of the view. */
export function addModuleAt(
  store: EditorStore,
  kind: MilsKind,
  size?: { width: number; depth: number },
  at?: { x: number; y: number },
  base?: { name: string; color: string },
) {
  const s = store.getState();
  let id = '';
  s.commit((p) => {
    const r = addModule(p, { levelId: s.levelId, kind, ...size, ...base, center: at ?? viewCenter(store), exact: !!at }, p.settings.snap);
    id = r.id;
    return r.project;
  });
  s.select([id]);
}

export type ObjectTemplate = Omit<NewObject, 'levelId' | 'center' | 'findSpace'>;

/** Add an item, marker or ride at `at` (dropped there) or near the middle of the view. */
export function addObjectAt(store: EditorStore, template: ObjectTemplate, at?: { x: number; y: number }) {
  const s = store.getState();
  let id = '';
  s.commit((p) => {
    const r = addObject(
      p,
      { layerId: itemLayerId(store), ...template, levelId: s.levelId, center: at ?? viewCenter(store), findSpace: !at && template.type === 'footprint' },
      p.settings.snap,
    );
    id = r.id;
    return r.project;
  });
  s.select([id]);
}

export function groupSelection(store: EditorStore) {
  const s = store.getState();
  if (s.selection.length < 2) return;
  s.commit((p) => groupItems(p, s.selection, '').project);
}

export function ungroupSelection(store: EditorStore) {
  const s = store.getState();
  const sel = new Set(s.selection);
  const groups = s.project.groups.filter((g) => g.memberIds.some((id) => sel.has(id)));
  if (groups.length) s.commit((p) => groups.reduce((acc, g) => ungroup(acc, g.id), p));
}

export function deleteSelection(store: EditorStore) {
  const s = store.getState();
  if (s.selection.length) s.commit((p) => deleteItems(p, s.selection), []);
}

export function rotateSelection(store: EditorStore, direction: 1 | -1) {
  const s = store.getState();
  if (s.selection.length) s.commit((p) => rotateItems(p, withCarriedItems(p, s.selection), direction, p.settings.snap));
}

export function nudgeSelection(store: EditorStore, dx: number, dy: number) {
  const s = store.getState();
  if (!s.selection.length) return;
  const step = s.project.settings.snap === 'half' ? 0.5 : 1;
  s.commit((p) => moveItems(p, withCarriedItems(p, s.selection), dx * step, dy * step));
}

export function duplicateSelection(store: EditorStore) {
  const s = store.getState();
  if (!s.selection.length) return;
  let ids: string[] = [];
  s.commit((p) => {
    const r = duplicateItems(p, withCarriedItems(p, s.selection));
    ids = r.ids;
    return r.project;
  });
  s.select(ids);
}

export function copySelection(store: EditorStore) {
  const s = store.getState();
  const set = new Set(s.selection);
  const carried = new Set(withCarriedItems(s.project, set));
  const items = allItems(s.project).filter((i) => carried.has(i.id));
  if (items.length) s.set({ clipboard: structuredClone(items) });
}

/** Paste the clipboard centred in the view, on the active level, on the snap grid. */
export function paste(store: EditorStore) {
  const s = store.getState();
  const b = unionRect(s.clipboard.map(footprint));
  if (!b) return;
  const c = viewCenter(store);
  const mode = s.project.settings.snap;
  const dx = snap(c.x - b.width / 2, mode) - b.x;
  const dy = snap(c.y - b.depth / 2, mode) - b.y;
  let ids: string[] = [];
  s.commit((p) => {
    const r = insertCopies(p, s.clipboard, s.levelId, dx, dy);
    ids = r.ids;
    return r.project;
  });
  s.select(ids);
}

export function selectAll(store: EditorStore) {
  const s = store.getState();
  s.select(itemsOnLevel(s.project, s.levelId).filter((i) => isEditable(store, i.layerId)).map((i) => i.id));
}

export function isEditable(store: EditorStore, layerId: string): boolean {
  const layer = store.getState().project.layers.find((l) => l.id === layerId);
  return !!layer && layer.visible && !layer.locked;
}

/** The layer new markers and items go on: the one picked in Layers, or the default. */
export function itemLayerId(store: EditorStore): string {
  const { project, activeLayerId } = store.getState();
  return activeLayerId && project.layers.some((l) => l.id === activeLayerId) ? activeLayerId : defaultItemLayerId(project);
}

/** Finish a Draw stroke: paint (or erase) its cells as one undoable change. */
export function finishStroke(store: EditorStore, cells: Cell[]) {
  const s = store.getState();
  const layerId = itemLayerId(store);
  const template = paintTemplate(s.project, s.draw);
  if (s.draw.erase) {
    s.commit((p) => eraseCells(p, s.levelId, layerId, cells, { cellW: template.width, cellD: template.depth, width: s.draw.width }).project, []);
    return;
  }
  let ids: string[] = [];
  s.commit((p) => {
    const r = paintCells(p, s.levelId, layerId, template, cells, s.draw.whenTaken);
    ids = r.ids;
    return r.project;
  });
  if (ids.length) s.select([]);
}

/** Control points without near-duplicates (a double-click lands twice on one spot). */
export function cleanCurvePoints(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const q of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) >= 0.5) out.push(q);
  }
  return out;
}

/** Draw › Curve finished: lay the pieces along the curve as one editable group (one undo). */
export function finishCurve(store: EditorStore) {
  const s = store.getState();
  const points = cleanCurvePoints(s.curveDraft ?? []);
  s.set({ curveDraft: null });
  if (points.length < 2) return;
  if (s.draw.erase) {
    const t = paintTemplate(s.project, s.draw);
    finishStroke(store, cellsForPath(splinePoints(points), { cellW: t.width, cellD: t.depth, width: s.draw.width }));
    return;
  }
  s.commit((p) => drawCurve(p, { levelId: s.levelId, layerId: itemLayerId(store), points, width: s.draw.width, template: paintTemplate(p, s.draw), whenTaken: s.draw.whenTaken })?.project ?? p, []);
}

/** Move a curve's handle: re-lay its pieces and keep the group selected (one undo). */
export function reshapeCurveTo(store: EditorStore, curveId: string, points: Pt[]) {
  const s = store.getState();
  const curve = s.project.curves.find((c) => c.id === curveId);
  if (!curve) return;
  let ids: string[] = [];
  s.commit((p) => {
    const next = reshapeCurve(p, curveId, points);
    ids = next.groups.find((g) => g.id === curve.groupId)?.memberIds ?? [];
    return next;
  });
  store.getState().select(ids);
}

/** Save the selection (and what sits on it) as a design; returns false if nothing qualifies. */
export function saveSelectionAsDesign(store: EditorStore, name: string): boolean {
  const s = store.getState();
  let ok = false;
  s.commit((p) => {
    const r = saveDesign(p, withCarriedItems(p, s.selection), name);
    ok = !!r;
    return r ? r.project : p;
  });
  return ok;
}

/** Place a copy of a design at `at` (dropped there) or centred in the view. */
export function placeDesignAt(store: EditorStore, designId: string, at?: { x: number; y: number }) {
  const s = store.getState();
  const d = s.project.designs.find((x) => x.id === designId);
  if (!d) return;
  const size = designSize(d);
  let ids: string[] = [];
  s.commit((p) => {
    // Dropped: exactly there. Tapped: the nearest free space to the middle of the view.
    const corner = at
      ? { x: at.x - size.width / 2, y: at.y - size.depth / 2 }
      : findFreeSpot(p, s.levelId, Math.max(1, size.width), Math.max(1, size.depth), viewCenter(store), p.settings.snap);
    const r = placeDesign(p, designId, s.levelId, corner, p.settings.snap);
    ids = r?.ids ?? [];
    return r ? r.project : p;
  });
  s.select(ids);
}

