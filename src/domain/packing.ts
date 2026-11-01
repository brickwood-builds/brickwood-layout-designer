// Packing (Phase 5A, FR-10): containers with permanent IDs, what is in them (things from the
// plan and non-LEGO equipment), boxes inside boxes, sizes, weights, storage and history.
import { newId, nowIso } from './ids';
import { allItems, findItem, isModule, type Item } from './edits';
import { moduleDisplayName, type Container, type Project } from './schema';

export const KIND_LABEL: Record<Container['kind'], string> = {
  tote: 'Tote',
  box: 'Box',
  crate: 'Crate',
  board: 'Carrying board',
  bag: 'Bag',
  case: 'Case',
  other: 'Container',
};

const note = (text: string) => ({ id: newId(), at: nowIso(), text });

/** Next permanent ID. Retired containers keep theirs, so codes are never given out twice. */
export function nextContainerCode(p: Project): string {
  const used = p.containers.map((c) => Number(/^BX-(\d+)$/.exec(c.code)?.[1] ?? 0));
  return `BX-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}

export const containerLabel = (c: Container) => `${c.code}${c.name ? ` ${c.name}` : ` ${KIND_LABEL[c.kind]}`}`;
export const activeContainers = (p: Project) => p.containers.filter((c) => !c.retired);

/** What needs packing: modules (MILS plates and features) and ride/building outlines. */
export const isPackable = (i: Item) => isModule(i) || i.type === 'footprint';
export const itemName = (i: Item) => (isModule(i) ? moduleDisplayName(i) : i.name || 'Item');
const byName = (a: Item, b: Item) => itemName(a).localeCompare(itemName(b), undefined, { numeric: true, sensitivity: 'base' });
export const packables = (p: Project, levelId?: string) =>
  allItems(p)
    .filter((i) => isPackable(i) && (!levelId || i.levelId === levelId))
    .sort(byName);
export const containerOf = (p: Project, itemId: string) => activeContainers(p).find((c) => c.itemIds.includes(itemId));
export const unpacked = (p: Project, levelId?: string) => packables(p, levelId).filter((i) => !containerOf(p, i.id));

export type NewContainer = Partial<Pick<Container, 'name' | 'widthIn' | 'depthIn' | 'heightIn' | 'weightLb' | 'storage' | 'handling' | 'parentId'>> & { kind: Container['kind'] };

export function addContainer(p: Project, spec: NewContainer): { project: Project; id: string } {
  const code = nextContainerCode(p);
  const c: Container = {
    id: newId(),
    code,
    name: spec.name?.trim() ?? '',
    kind: spec.kind,
    ...(spec.widthIn ? { widthIn: spec.widthIn } : {}),
    ...(spec.depthIn ? { depthIn: spec.depthIn } : {}),
    ...(spec.heightIn ? { heightIn: spec.heightIn } : {}),
    ...(spec.weightLb !== undefined ? { weightLb: spec.weightLb } : {}),
    storage: spec.storage?.trim() ?? '',
    handling: spec.handling?.trim() ?? '',
    ...(spec.parentId ? { parentId: spec.parentId } : {}),
    itemIds: [],
    equipment: [],
    retired: false,
    history: [note(`${code} added`)],
    createdAt: nowIso(),
  };
  return { project: { ...p, containers: [...p.containers, c] }, id: c.id };
}

const mapC = (p: Project, id: string, f: (c: Container) => Container): Project => ({ ...p, containers: p.containers.map((c) => (c.id === id ? f(c) : c)) });

export type ContainerEdit = Partial<Pick<Container, 'name' | 'kind' | 'widthIn' | 'depthIn' | 'heightIn' | 'weightLb' | 'storage' | 'handling'>>;

/** Edit a container; a new storage place is recorded in its history (where it is now). */
export function updateContainer(p: Project, id: string, change: ContainerEdit): Project {
  return mapC(p, id, (c) => {
    const next = { ...c, ...change };
    for (const k of ['widthIn', 'depthIn', 'heightIn', 'weightLb'] as const) if (k in change && change[k] === undefined) delete next[k];
    if (change.storage !== undefined && change.storage.trim() !== c.storage) {
      next.storage = change.storage.trim();
      next.history = [...c.history, note(next.storage ? `Now at: ${next.storage}` : 'Storage place cleared')];
    }
    return next;
  });
}

export const addContainerNote = (p: Project, id: string, text: string): Project => (text.trim() ? mapC(p, id, (c) => ({ ...c, history: [...c.history, note(text.trim())] })) : p);

/** Put things in a container (taking them out of any other one). */
export function packItems(p: Project, containerId: string, itemIds: string[]): Project {
  const ids = itemIds.filter((id) => findItem(p, id));
  if (!ids.length) return p;
  const names = ids.map((id) => itemName(findItem(p, id)!));
  return {
    ...p,
    containers: p.containers.map((c) => {
      if (c.id === containerId) return { ...c, itemIds: [...new Set([...c.itemIds, ...ids])], history: [...c.history, note(`Packed: ${names.join(', ')}`)] };
      if (c.itemIds.some((x) => ids.includes(x))) return { ...c, itemIds: c.itemIds.filter((x) => !ids.includes(x)) };
      return c;
    }),
  };
}

export function unpackItems(p: Project, itemIds: string[]): Project {
  return { ...p, containers: p.containers.map((c) => (c.itemIds.some((x) => itemIds.includes(x)) ? { ...c, itemIds: c.itemIds.filter((x) => !itemIds.includes(x)) } : c)) };
}

/** Containers inside this one (all levels down). */
export function nestedIn(p: Project, id: string): Container[] {
  const kids = p.containers.filter((c) => c.parentId === id && !c.retired);
  return kids.flatMap((k) => [k, ...nestedIn(p, k.id)]);
}

/** Put a container inside another (or take it out with null). Never inside itself. */
export function setParent(p: Project, id: string, parentId: string | null): Project {
  if (parentId && (parentId === id || nestedIn(p, id).some((c) => c.id === parentId))) return p;
  return mapC(p, id, (c) => {
    const next = { ...c };
    if (parentId) next.parentId = parentId;
    else delete next.parentId;
    const parent = parentId ? p.containers.find((x) => x.id === parentId) : undefined;
    next.history = [...c.history, note(parent ? `Put inside ${parent.code}` : 'Taken out of its outer container')];
    return next;
  });
}

export function addEquipment(p: Project, id: string, name: string, qty: number): Project {
  if (!name.trim() || qty < 1) return p;
  return mapC(p, id, (c) => ({ ...c, equipment: [...c.equipment, { id: newId(), name: name.trim(), qty: Math.floor(qty) }] }));
}

export const removeEquipment = (p: Project, id: string, eqId: string): Project => mapC(p, id, (c) => ({ ...c, equipment: c.equipment.filter((e) => e.id !== eqId) }));

/** Retire a container: it is emptied, its ID stays reserved, and its history is kept. */
export function retireContainer(p: Project, id: string, why: string): Project {
  return {
    ...p,
    containers: p.containers.map((c) => {
      if (c.id === id) return { ...c, retired: true, itemIds: [], parentId: undefined, history: [...c.history, note(`Retired${why.trim() ? `: ${why.trim()}` : ''}`)] };
      if (c.parentId === id) {
        const next = { ...c };
        delete next.parentId;
        return next;
      }
      return c;
    }),
  };
}

/** What is in a container, as lines for lists and labels (nested containers by ID). */
export function contentsOf(p: Project, c: Container): string[] {
  const items = c.itemIds.map((id) => findItem(p, id)).filter((i): i is Item => !!i).map(itemName);
  const eq = c.equipment.map((e) => (e.qty > 1 ? `${e.qty} × ${e.name}` : e.name));
  const kids = p.containers.filter((x) => x.parentId === c.id && !x.retired).map((x) => `Inside: ${containerLabel(x)}`);
  return [...items, ...eq, ...kids];
}

export const volumeCuFt = (c: Pick<Container, 'widthIn' | 'depthIn' | 'heightIn'>) => (c.widthIn && c.depthIn && c.heightIn ? (c.widthIn * c.depthIn * c.heightIn) / 1728 : null);

/** Weight including containers inside it (each counted once). */
export function totalWeight(p: Project, c: Container): number | null {
  const all = [c, ...nestedIn(p, c.id)];
  if (all.every((x) => x.weightLb === undefined)) return null;
  return Math.round(all.reduce((n, x) => n + (x.weightLb ?? 0), 0) * 10) / 10;
}

/** Outer containers (not inside another active one). */
export const outerContainers = (p: Project) => activeContainers(p).filter((c) => !c.parentId || !p.containers.some((x) => x.id === c.parentId && !x.retired));

/** The outermost container a thing travels in (for checklists). */
export function outerOf(p: Project, c: Container): Container {
  let cur = c;
  const seen = new Set<string>();
  while (cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const up = p.containers.find((x) => x.id === cur.parentId && !x.retired);
    if (!up) break;
    cur = up;
  }
  return cur;
}
