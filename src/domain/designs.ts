// Reusable designs (FR-05.01, FR-06.03): arrange things once, place linked copies.
// Copies are never changed silently: when the design changes, each copy offers
// "update this copy" or "keep as is".
import { nowIso, newId } from './ids';
import { deleteItems, findItem, insertCopies, isModule, type Item } from './edits';
import { footprint, snap, unionRect } from './geometry';
import type { Design, Group, Project } from './schema';

/** MILS plates (with IDs) stay out of designs: they're physical plates. */
export const designable = (i: Item) => !(isModule(i) && i.label.trim() !== '');

function snapshot(p: Project, ids: Iterable<string>) {
  const items = [...new Set(ids)].map((id) => findItem(p, id)).filter((i): i is Item => !!i && designable(i));
  const b = unionRect(items.map(footprint));
  if (!b) return null;
  const rel = <T extends Item>(i: T): T => ({ ...structuredClone(i), x: i.x - b.x, y: i.y - b.y });
  return {
    origin: { x: b.x, y: b.y },
    modules: items.filter(isModule).map(rel),
    objects: items.filter((i) => !isModule(i)).map(rel) as Design['objects'],
  };
}

/** Save the selection as a design; the selection itself becomes copy no. 1. */
export function saveDesign(p: Project, ids: string[], name: string): { project: Project; designId: string; groupId: string } | null {
  const snap0 = snapshot(p, ids);
  if (!snap0 || snap0.modules.length + snap0.objects.length === 0) return null;
  const design: Design = { id: newId(), name: name.trim() || 'Design', version: 1, updatedAt: nowIso(), modules: snap0.modules, objects: snap0.objects };
  const members = [...snap0.modules, ...snap0.objects].map((i) => i.id);
  const set = new Set(members);
  const groups = p.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => !set.has(m)) })).filter((g) => g.memberIds.length > 1);
  const group: Group = { id: newId(), name: design.name, memberIds: members, designId: design.id, designVersion: 1 };
  return { project: { ...p, designs: [...p.designs, design], groups: [...groups, group] }, designId: design.id, groupId: group.id };
}

/** Place a linked copy with its upper-left corner near `at` (snapped). */
export function placeDesign(p: Project, designId: string, levelId: string, at: { x: number; y: number }, mode: 'full' | 'half' | 'free'): { project: Project; ids: string[]; groupId: string } | null {
  const d = p.designs.find((x) => x.id === designId);
  if (!d) return null;
  // The copy gets exactly one group: its design link (not copies of the original's groups).
  const { project, ids } = insertCopies(p, [...d.modules, ...d.objects], levelId, snap(at.x, mode), snap(at.y, mode), false);
  const group: Group = { id: newId(), name: d.name, memberIds: ids, designId: d.id, designVersion: d.version };
  return { project: { ...project, groups: [...project.groups, group] }, ids, groupId: group.id };
}

export function designSize(d: Design) {
  return unionRect([...d.modules, ...d.objects].map(footprint)) ?? { x: 0, y: 0, width: 0, depth: 0 };
}

export const copiesOf = (p: Project, designId: string) => p.groups.filter((g) => g.designId === designId);

export function isOutdated(p: Project, g: Group): boolean {
  const d = g.designId ? p.designs.find((x) => x.id === g.designId) : undefined;
  return !!d && (g.designVersion ?? 0) < d.version;
}

/** Make this copy the new version of its design. Other copies are only flagged. */
export function updateDesignFromCopy(p: Project, groupId: string): Project {
  const g = p.groups.find((x) => x.id === groupId);
  const d = g?.designId ? p.designs.find((x) => x.id === g.designId) : undefined;
  if (!g || !d) return p;
  const snap0 = snapshot(p, g.memberIds);
  if (!snap0) return p;
  const version = d.version + 1;
  return {
    ...p,
    designs: p.designs.map((x) => (x.id === d.id ? { ...x, version, updatedAt: nowIso(), modules: snap0.modules, objects: snap0.objects } : x)),
    groups: p.groups.map((x) => (x.id === g.id ? { ...x, designVersion: version } : x)),
  };
}

/** Replace a copy's contents with the latest design, in the same place (one undo). */
export function updateCopyToDesign(p: Project, groupId: string): Project {
  const g = p.groups.find((x) => x.id === groupId);
  const d = g?.designId ? p.designs.find((x) => x.id === g.designId) : undefined;
  if (!g || !d) return p;
  const members = g.memberIds.map((id) => findItem(p, id)).filter((i): i is Item => !!i);
  const b = unionRect(members.map(footprint));
  const levelId = members[0]?.levelId ?? p.levels[0]!.id;
  const removed = deleteItems(p, g.memberIds);
  const { project, ids } = insertCopies(removed, [...d.modules, ...d.objects], levelId, b?.x ?? 0, b?.y ?? 0, false);
  return { ...project, groups: [...project.groups.filter((x) => x.id !== g.id), { ...g, memberIds: ids, designVersion: d.version }] };
}

/** Keep a copy as it is, no longer linked to its design (stays a normal group). */
export function unlinkCopy(p: Project, groupId: string): Project {
  return { ...p, groups: p.groups.map((g) => (g.id === groupId ? { id: g.id, name: g.name, memberIds: g.memberIds } : g)) };
}

/** Remove a design from the palette; its copies stay, unlinked. */
export function deleteDesign(p: Project, designId: string): Project {
  return {
    ...p,
    designs: p.designs.filter((d) => d.id !== designId),
    groups: p.groups.map((g) => (g.designId === designId ? { id: g.id, name: g.name, memberIds: g.memberIds } : g)),
  };
}
