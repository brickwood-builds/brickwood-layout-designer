// Physical builds (Phase 4, FR-05): the real things you built, each with a permanent ID.
// A build keeps its ID through repairs and rebuilds (FR-05.07); a distinct replacement
// gets a new ID that points back to the one it replaces. History is never erased.
import { newId, nowIso } from './ids';
import { groupOf } from './objects';
import { findItem, isModule } from './edits';
import { moduleDisplayName, type Build, type BuildCondition, type BuildStatus, type Project } from './schema';

export const STATUS_LABEL: Record<BuildStatus, string> = {
  planned: 'Planned',
  building: 'Being built',
  built: 'Built',
  'partly-dismantled': 'Partly taken apart',
  dismantled: 'Taken apart',
  replaced: 'Replaced',
};

export const CONDITION_LABEL: Record<BuildCondition, string> = {
  good: 'Good',
  'needs-repair': 'Needs repair',
  damaged: 'Damaged',
};

type HistoryKind = Build['history'][number]['kind'];
const entry = (kind: HistoryKind, text: string) => ({ id: newId(), at: nowIso(), kind, text });

/** Next permanent ID: PB-001, PB-002… (codes are never reused, even after replacement). */
export function nextBuildCode(p: Project): string {
  const used = p.builds.map((b) => Number(/^PB-(\d+)$/.exec(b.code)?.[1] ?? 0));
  return `PB-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}

export const buildOfItem = (p: Project, itemId: string) => p.builds.find((b) => b.itemIds.includes(itemId) && b.status !== 'replaced');

/** A sensible name for a build made from these items: the group's name, or the first item's. */
export function suggestedName(p: Project, ids: string[]): string {
  const g = ids.length ? groupOf(p, ids[0]!) : undefined;
  if (g && g.memberIds.every((id) => ids.includes(id))) return g.name;
  const first = ids.length ? findItem(p, ids[0]!) : undefined;
  if (!first) return 'New build';
  return isModule(first) ? moduleDisplayName(first) : first.name || 'New build';
}

/** Start tracking the selected things as one physical build. Things already in a build are left out. */
export function createBuild(p: Project, ids: string[], name: string, status: BuildStatus = 'built'): { project: Project; buildId: string } | null {
  const free = ids.filter((id) => findItem(p, id) && !buildOfItem(p, id));
  if (!free.length) return null;
  const g = groupOf(p, free[0]!);
  const code = nextBuildCode(p);
  const build: Build = {
    id: newId(),
    code,
    name: name.trim() || suggestedName(p, free),
    itemIds: free,
    ...(g?.designId ? { designId: g.designId, designVersion: g.designVersion } : {}),
    status,
    condition: 'good',
    storage: '',
    progress: status === 'built' ? 100 : 0,
    milestones: [],
    setupNotes: '',
    notes: '',
    photos: [],
    history: [entry('created', `${code} started being tracked (${STATUS_LABEL[status].toLowerCase()})`)],
    createdAt: nowIso(),
  };
  return { project: { ...p, builds: [...p.builds, build] }, buildId: build.id };
}

const mapBuild = (p: Project, id: string, f: (b: Build) => Build): Project => ({ ...p, builds: p.builds.map((b) => (b.id === id ? f(b) : b)) });

export type BuildEdit = Partial<Pick<Build, 'name' | 'storage' | 'progress' | 'setupNotes' | 'notes' | 'status' | 'condition'>>;

/** Edit a build; status, condition and storage changes are written to its history. */
export function updateBuild(p: Project, id: string, change: BuildEdit): Project {
  return mapBuild(p, id, (b) => {
    const history = [...b.history];
    if (change.status && change.status !== b.status) history.push(entry('status', `${STATUS_LABEL[b.status]} → ${STATUS_LABEL[change.status]}`));
    if (change.condition && change.condition !== b.condition) history.push(entry('condition', `Condition: ${CONDITION_LABEL[b.condition]} → ${CONDITION_LABEL[change.condition]}`));
    if (change.storage !== undefined && change.storage.trim() !== b.storage) history.push(entry('storage', change.storage.trim() ? `Stored at: ${change.storage.trim()}` : 'Storage place cleared'));
    const next = { ...b, ...change, ...(change.storage !== undefined ? { storage: change.storage.trim() } : {}), history };
    if (change.status === 'built' && b.status !== 'built') next.progress = 100;
    return next;
  });
}

/** Add a note or a repair to the history (repairs can also set the condition back to good). */
export function addHistory(p: Project, id: string, kind: 'note' | 'repair', text: string, fixed = false): Project {
  if (!text.trim()) return p;
  return mapBuild(p, id, (b) => {
    const history = [...b.history, entry(kind, text.trim())];
    if (kind === 'repair' && fixed && b.condition !== 'good') {
      history.push(entry('condition', `Condition: ${CONDITION_LABEL[b.condition]} → ${CONDITION_LABEL.good}`));
      return { ...b, condition: 'good', history };
    }
    return { ...b, history };
  });
}

export function addMilestone(p: Project, id: string, text: string): Project {
  if (!text.trim()) return p;
  return mapBuild(p, id, (b) => ({ ...b, milestones: [...b.milestones, { id: newId(), text: text.trim(), done: false }] }));
}

/** Tick a milestone; progress follows the share of milestones done. */
export function toggleMilestone(p: Project, id: string, milestoneId: string): Project {
  return mapBuild(p, id, (b) => {
    const milestones = b.milestones.map((m) => (m.id === milestoneId ? (m.done ? { id: m.id, text: m.text, done: false } : { ...m, done: true, doneAt: nowIso() }) : m));
    const done = milestones.filter((m) => m.done).length;
    const ms = milestones.find((m) => m.id === milestoneId)!;
    return {
      ...b,
      milestones,
      progress: Math.round((done / milestones.length) * 100),
      history: ms.done ? [...b.history, entry('note', `Milestone done: ${ms.text}`)] : b.history,
    };
  });
}

export const removeMilestone = (p: Project, id: string, milestoneId: string): Project => mapBuild(p, id, (b) => ({ ...b, milestones: b.milestones.filter((m) => m.id !== milestoneId) }));

/** Rebuilt (same physical thing, same ID): back to "being built", history kept. */
export function rebuild(p: Project, id: string, why: string): Project {
  return mapBuild(p, id, (b) => ({
    ...b,
    status: 'building',
    progress: 0,
    milestones: b.milestones.map((m) => ({ id: m.id, text: m.text, done: false })),
    history: [...b.history, entry('rebuilt', why.trim() ? `Rebuilt: ${why.trim()}` : 'Rebuilt')],
  }));
}

/** Taken apart, partly or for good. Its parts go back to loose stock by hand (parts list). */
export function dismantle(p: Project, id: string, partly: boolean, why: string): Project {
  return mapBuild(p, id, (b) => ({
    ...b,
    status: partly ? 'partly-dismantled' : 'dismantled',
    history: [...b.history, entry('dismantled', `${partly ? 'Partly taken apart' : 'Taken apart'}${why.trim() ? `: ${why.trim()}` : ''}`)],
  }));
}

/**
 * Replaced by a distinct new build (FR-05.07): the new one gets a new ID and takes over the
 * things on the plan; the old record stays, marked replaced, with its history.
 */
export function replaceBuild(p: Project, id: string, why: string): { project: Project; buildId: string } | null {
  const old = p.builds.find((b) => b.id === id);
  if (!old || old.status === 'replaced') return null;
  const code = nextBuildCode(p);
  const fresh: Build = {
    ...old,
    id: newId(),
    code,
    status: 'building',
    condition: 'good',
    progress: 0,
    milestones: old.milestones.map((m) => ({ id: newId(), text: m.text, done: false })),
    photos: [],
    replaces: old.id,
    replacedBy: undefined,
    history: [entry('created', `${code} replaces ${old.code}${why.trim() ? `: ${why.trim()}` : ''}`)],
    createdAt: nowIso(),
  };
  delete fresh.replacedBy;
  const project = {
    ...p,
    builds: [
      ...p.builds.map((b) => (b.id === id ? { ...b, status: 'replaced' as const, replacedBy: fresh.id, history: [...b.history, entry('replaced', `Replaced by ${code}${why.trim() ? `: ${why.trim()}` : ''}`)] } : b)),
      fresh,
    ],
  };
  return { project, buildId: fresh.id };
}

export function addPhotoToBuild(p: Project, id: string, photoId: string, caption: string): Project {
  return mapBuild(p, id, (b) => ({ ...b, photos: [...b.photos, photoId], history: [...b.history, entry('photo', caption.trim() ? `Photo: ${caption.trim()}` : 'Photo added')] }));
}

export const removePhotoFromBuild = (p: Project, id: string, photoId: string): Project => mapBuild(p, id, (b) => ({ ...b, photos: b.photos.filter((x) => x !== photoId) }));

/** Stop tracking (only for mistakes: the record and its ID are gone). */
export const deleteBuild = (p: Project, id: string): Project => ({ ...p, builds: p.builds.filter((b) => b.id !== id) });

/** Things on the plan that are part of this build (deleted ones dropped). */
export const buildItems = (p: Project, b: Build) => b.itemIds.filter((id) => findItem(p, id));
