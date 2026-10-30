// Editor commands shared by the toolbar, keyboard shortcuts and panels.
import { levelBounds, snap, unionRect, footprint } from '../domain/geometry';
import {
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
import { addObject, groupItems, ungroup, type NewObject } from '../domain/objects';
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
export function addModuleAt(store: EditorStore, kind: MilsKind, size?: { width: number; depth: number }, at?: { x: number; y: number }) {
  const s = store.getState();
  let id = '';
  s.commit((p) => {
    const r = addModule(p, { levelId: s.levelId, kind, ...size, center: at ?? viewCenter(store), exact: !!at }, p.settings.snap);
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
      { ...template, levelId: s.levelId, center: at ?? viewCenter(store), findSpace: !at && template.type === 'footprint' },
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
  if (s.selection.length) s.commit((p) => rotateItems(p, s.selection, direction, p.settings.snap));
}

export function nudgeSelection(store: EditorStore, dx: number, dy: number) {
  const s = store.getState();
  if (!s.selection.length) return;
  const step = s.project.settings.snap === 'half' ? 0.5 : 1;
  s.commit((p) => moveItems(p, s.selection, dx * step, dy * step));
}

export function duplicateSelection(store: EditorStore) {
  const s = store.getState();
  if (!s.selection.length) return;
  let ids: string[] = [];
  s.commit((p) => {
    const r = duplicateItems(p, s.selection);
    ids = r.ids;
    return r.project;
  });
  s.select(ids);
}

export function copySelection(store: EditorStore) {
  const s = store.getState();
  const set = new Set(s.selection);
  const items = allItems(s.project).filter((i) => set.has(i.id));
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
