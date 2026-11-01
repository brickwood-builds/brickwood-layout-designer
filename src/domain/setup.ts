// Setup and teardown at a show (Phase 6, FR-11). The task list is worked out from the layout:
// place each MILS plate and feature (left to right on each level), then put out the removable
// things marked on it (setup markers and small items). Pieces built onto plates travel fixed,
// so they are not tasks. Your own tasks can be added. Teardown is the same in reverse.
import { newId, nowIso } from './ids';
import { footprint } from './geometry';
import { isModule, type Item } from './edits';
import { itemName, packables } from './packing';
import type { CanvasObject, MilsModule, Project, Show } from './schema';

export type Phase = 'setup' | 'teardown';
export type TaskStatus = 'open' | 'assigned' | 'claimed' | 'done';
type SetupData = Show['setup'];
type TaskState = SetupData['states'][string];

export interface Dep {
  key: string;
  required: boolean;
}

export interface SetupTask {
  /** Stable key, e.g. "setup:module:<id>", "teardown:loose:<id>", "setup:custom:<id>". */
  key: string;
  phase: Phase;
  kind: 'module' | 'loose' | 'custom';
  title: string;
  /** What to put out / pack up (loose tasks). */
  details: string[];
  levelId?: string;
  itemId?: string;
  deps: Dep[];
}

export interface TaskView extends SetupTask {
  status: TaskStatus;
  helper?: string;
  by?: string;
  at?: string;
  overridden?: boolean;
  /** Required steps not done yet (doing it now needs a reason). */
  blockedBy: string[];
  /** Preferred steps not done yet (a hint only). */
  waitingFor: string[];
}

/** Setup markers and small items are put out at the show; single pieces are built on. */
export const isRemovable = (o: CanvasObject) => o.type === 'setupMarker' || o.type === 'item';

/** The module a thing sits on (the smallest one under its centre: a feature before its plate). */
function ownerOf(o: CanvasObject, modules: MilsModule[]): MilsModule | undefined {
  const f = footprint(o);
  const cx = f.x + f.width / 2;
  const cy = f.y + f.depth / 2;
  return modules
    .filter((m) => m.levelId === o.levelId)
    .filter((m) => {
      const r = footprint(m);
      return cx > r.x && cx < r.x + r.width && cy > r.y && cy < r.y + r.depth;
    })
    .sort((a, b) => a.width * a.depth - b.width * b.depth)[0];
}

function summary(objs: CanvasObject[]): string[] {
  const m = new Map<string, number>();
  for (const o of objs) m.set(o.name || 'Item', (m.get(o.name || 'Item') ?? 0) + 1);
  return [...m].map(([n, c]) => (c > 1 ? `${c} × ${n}` : n));
}

/** The task list for a show, in a sensible order (left to right on each level). */
export function setupTasks(p: Project, show: Show): SetupTask[] {
  const omitted = new Set(show.omittedIds);
  const levelOrder = new Map([...p.levels].sort((a, b) => a.order - b.order).map((l, i) => [l.id, i]));
  const going = packables(p)
    .filter((i) => !omitted.has(i.id))
    .sort((a, b) => (levelOrder.get(a.levelId) ?? 0) - (levelOrder.get(b.levelId) ?? 0) || a.x - b.x || a.y - b.y);
  const goingModules = going.filter(isModule);
  const looseByOwner = new Map<string, CanvasObject[]>();
  const unowned: CanvasObject[] = [];
  for (const o of p.objects) {
    if (!isRemovable(o) || omitted.has(o.id)) continue;
    const owner = ownerOf(o, p.modules);
    if (owner && omitted.has(owner.id)) continue; // its module stays home
    if (owner) looseByOwner.set(owner.id, [...(looseByOwner.get(owner.id) ?? []), o]);
    else unowned.push(o);
  }

  const setup: SetupTask[] = [];
  const prevOnLevel = new Map<string, string>();
  for (const i of going) {
    const key = `setup:module:${i.id}`;
    const prev = prevOnLevel.get(i.levelId);
    setup.push({ key, phase: 'setup', kind: 'module', title: `Place ${itemName(i)}`, details: [], levelId: i.levelId, itemId: i.id, deps: prev ? [{ key: prev, required: false }] : [] });
    prevOnLevel.set(i.levelId, key);
  }
  for (const m of goingModules) {
    const things = looseByOwner.get(m.id);
    if (!things?.length) continue;
    setup.push({ key: `setup:loose:${m.id}`, phase: 'setup', kind: 'loose', title: `Put out the things on ${itemName(m)}`, details: summary(things), levelId: m.levelId, itemId: m.id, deps: [{ key: `setup:module:${m.id}`, required: true }] });
  }
  if (unowned.length) setup.push({ key: 'setup:loose:none', phase: 'setup', kind: 'loose', title: 'Put out the things not on a module', details: summary(unowned), deps: [] });

  // Teardown: the same in reverse — pack up the loose things on a module before lifting it.
  const teardown: SetupTask[] = [];
  for (const t of [...setup].reverse()) {
    const id = t.key.slice('setup:'.length);
    const deps: Dep[] = t.kind === 'module' && looseByOwner.get(t.itemId!)?.length ? [{ key: `teardown:loose:${t.itemId}`, required: true }] : [];
    teardown.push({ ...t, key: `teardown:${id}`, phase: 'teardown', title: t.kind === 'module' ? `Pack up ${t.title.slice('Place '.length)}` : t.title.replace('Put out', 'Pack up'), deps });
  }
  // Loose packing first, then modules right to left.
  teardown.sort((a, b) => (a.kind === 'loose' ? 0 : 1) - (b.kind === 'loose' ? 0 : 1));

  const custom = show.setup.custom.map(
    (c): SetupTask => ({ key: `${c.phase}:custom:${c.id}`, phase: c.phase, kind: 'custom', title: c.title, details: [], deps: c.after ? [{ key: c.after, required: c.required }] : [] }),
  );
  const out = [...setup, ...teardown];
  // Own tasks go right after the task they follow (or at the end of their phase).
  for (const c of custom) {
    const at = c.deps[0] ? out.findIndex((t) => t.key === c.deps[0]!.key) : -1;
    if (at >= 0) out.splice(at + 1, 0, c);
    else {
      const lastOfPhase = out.map((t) => t.phase).lastIndexOf(c.phase);
      out.splice(lastOfPhase + 1, 0, c);
    }
  }
  return out;
}

/** Tasks with their progress, and what each is waiting for. */
export function taskViews(p: Project, show: Show): TaskView[] {
  const tasks = setupTasks(p, show);
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const done = (key: string) => show.setup.states[key]?.status === 'done';
  return tasks.map((t) => {
    const st = show.setup.states[t.key];
    const pending = t.deps.filter((d) => byKey.has(d.key) && !done(d.key));
    return {
      ...t,
      status: st?.status ?? 'open',
      helper: st?.helper,
      by: st?.by,
      at: st?.at,
      overridden: st?.overridden,
      blockedBy: pending.filter((d) => d.required).map((d) => byKey.get(d.key)!.title),
      waitingFor: pending.filter((d) => !d.required).map((d) => byKey.get(d.key)!.title),
    };
  });
}

const mapSetup = (p: Project, showId: string, f: (s: SetupData) => SetupData): Project => ({ ...p, shows: p.shows.map((s) => (s.id === showId ? { ...s, setup: f(s.setup) } : s)) });
const logEntry = (who: string, text: string, kind: SetupData['log'][number]['kind'], key?: string) => ({ id: newId(), at: nowIso(), who: who || 'Someone', text, kind, ...(key ? { key } : {}) });

function setState(p: Project, showId: string, key: string, title: string, who: string, state: TaskState, text: string, kind: SetupData['log'][number]['kind'] = 'task'): Project {
  return mapSetup(p, showId, (s) => ({ ...s, states: { ...s.states, [key]: state }, log: [...s.log, logEntry(who, `${text}: ${title}`, kind, key)] }));
}

/** Assign a task to a helper (the organiser), or claim it (a helper takes it). */
export function assignTask(p: Project, showId: string, task: SetupTask, helper: string, who: string): Project {
  const claimed = helper === who;
  return setState(p, showId, task.key, task.title, who, { status: claimed ? 'claimed' : 'assigned', helper, at: nowIso() }, claimed ? 'Claimed' : `Assigned to ${helper}`);
}

/**
 * Mark a task done. If required steps before it aren't done, a reason is needed; the
 * override is kept in the log (TR-23). Returns null when a reason is needed but missing.
 */
export function completeTask(p: Project, showId: string, task: TaskView, who: string, reason = ''): Project | null {
  if (task.blockedBy.length && !reason.trim()) return null;
  let q = setState(p, showId, task.key, task.title, who, { status: 'done', helper: task.helper, by: who, at: nowIso(), ...(task.blockedBy.length ? { overridden: true } : {}) }, 'Done');
  if (task.blockedBy.length) q = mapSetup(q, showId, (s) => ({ ...s, log: [...s.log, logEntry(who, `Did “${task.title}” before ${task.blockedBy.join(', ')} — ${reason.trim()}`, 'override')] }));
  return q;
}

export function reopenTask(p: Project, showId: string, task: SetupTask, who: string): Project {
  return setState(p, showId, task.key, task.title, who, { status: 'open', at: nowIso() }, 'Reopened');
}

export function addHelper(p: Project, showId: string, name: string): Project {
  if (!name.trim()) return p;
  return mapSetup(p, showId, (s) => (s.helpers.includes(name.trim()) ? s : { ...s, helpers: [...s.helpers, name.trim()] }));
}

export const removeHelper = (p: Project, showId: string, name: string): Project => mapSetup(p, showId, (s) => ({ ...s, helpers: s.helpers.filter((h) => h !== name) }));

export function addCustomTask(p: Project, showId: string, title: string, phase: Phase, after: string | undefined, required: boolean): Project {
  if (!title.trim()) return p;
  return mapSetup(p, showId, (s) => ({ ...s, custom: [...s.custom, { id: newId(), title: title.trim(), phase, ...(after ? { after } : {}), required }] }));
}

export const removeCustomTask = (p: Project, showId: string, id: string): Project => mapSetup(p, showId, (s) => ({ ...s, custom: s.custom.filter((c) => c.id !== id) }));

export type TimeMark = keyof SetupData['times'];
const TIME_TEXT: Record<TimeMark, string> = { setupStart: 'Setup started', setupEnd: 'Setup finished', teardownStart: 'Teardown started', teardownEnd: 'Teardown finished' };

export function markTime(p: Project, showId: string, mark: TimeMark, who: string): Project {
  return mapSetup(p, showId, (s) => ({ ...s, times: { ...s.times, [mark]: nowIso() }, log: [...s.log, logEntry(who, TIME_TEXT[mark], 'timing')] }));
}

/** An issue or note during setup (an emergency change, a repair) — kept in the show's history. */
export function logIssue(p: Project, showId: string, who: string, text: string, kind: 'issue' | 'note' = 'issue'): Project {
  if (!text.trim()) return p;
  return mapSetup(p, showId, (s) => ({ ...s, log: [...s.log, logEntry(who, text.trim(), kind)] }));
}

/** "1 h 25 min" between two times (or null). */
export function duration(from?: string, to?: string): string | null {
  if (!from || !to) return null;
  const min = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

export function phaseProgress(views: TaskView[], phase: Phase) {
  const ts = views.filter((t) => t.phase === phase);
  return { done: ts.filter((t) => t.status === 'done').length, total: ts.length };
}

/** Things (removable) on a module, for its setup map. */
export function looseOn(p: Project, moduleId: string): Item[] {
  return p.objects.filter((o) => isRemovable(o) && ownerOf(o, p.modules)?.id === moduleId);
}

// ---- Helpers on their own devices (6B, FR-11.06 / TR-26) ----
// A helper opens the layout file on their own phone or tablet, ticks tasks offline, and
// sends back a progress file. Merging uses the activity log: a task changed only by the
// helper takes their state; a task both of you changed differently is a conflict to decide.

export const PROGRESS_KIND = 'brickwood-setup-progress';

export interface ProgressFile {
  kind: typeof PROGRESS_KIND;
  version: 1;
  projectId: string;
  showId: string;
  showName: string;
  from: string;
  exportedAt: string;
  setup: SetupData;
}

export function progressFile(p: Project, showId: string, from: string): ProgressFile | null {
  const show = p.shows.find((s) => s.id === showId);
  if (!show) return null;
  return { kind: PROGRESS_KIND, version: 1, projectId: p.id, showId, showName: show.name, from: from || 'Helper', exportedAt: nowIso(), setup: show.setup };
}

export interface Conflict {
  key: string;
  title: string;
  mine: TaskState | undefined;
  theirs: TaskState | undefined;
}

export interface MergePlan {
  showId: string;
  from: string;
  /** Tasks only the helper changed: their state is taken. */
  taken: string[];
  conflicts: Conflict[];
  newLog: SetupData['log'];
  setup: SetupData;
}

const sameState = (a?: TaskState, b?: TaskState) => (a?.status ?? 'open') === (b?.status ?? 'open') && (a?.helper ?? '') === (b?.helper ?? '');

/** Read a progress file and work out what merging it would do. Throws a readable error. */
export function planMerge(p: Project, text: string): MergePlan {
  let f: ProgressFile;
  try {
    f = JSON.parse(text) as ProgressFile;
  } catch {
    throw new Error('That isn’t a helper progress file.');
  }
  if (f?.kind !== PROGRESS_KIND) throw new Error('That isn’t a helper progress file.');
  const show = p.shows.find((s) => s.id === f.showId);
  if (!show) throw new Error(`This layout doesn’t have the show “${f.showName}”. Open the layout the helper was working on.`);
  const mineIds = new Set(show.setup.log.map((l) => l.id));
  const theirsIds = new Set(f.setup.log.map((l) => l.id));
  const newTheirs = f.setup.log.filter((l) => !mineIds.has(l.id));
  const newMine = show.setup.log.filter((l) => !theirsIds.has(l.id));
  const theirKeys = new Set(newTheirs.map((l) => l.key).filter((k): k is string => !!k));
  const myKeys = new Set(newMine.map((l) => l.key).filter((k): k is string => !!k));
  const titles = new Map(setupTasks(p, show).map((t) => [t.key, t.title]));
  const taken: string[] = [];
  const conflicts: Conflict[] = [];
  const states = { ...show.setup.states };
  for (const key of theirKeys) {
    const theirs = f.setup.states[key];
    const mine = show.setup.states[key];
    if (!myKeys.has(key) || sameState(mine, theirs)) {
      if (theirs) states[key] = theirs;
      else delete states[key];
      taken.push(key);
    } else conflicts.push({ key, title: titles.get(key) ?? key, mine, theirs });
  }
  const customIds = new Set(show.setup.custom.map((c) => c.id));
  const setup: SetupData = {
    ...show.setup,
    helpers: [...new Set([...show.setup.helpers, ...f.setup.helpers])],
    custom: [...show.setup.custom, ...f.setup.custom.filter((c) => !customIds.has(c.id))],
    states,
    log: [...show.setup.log, ...newTheirs].sort((a, b) => a.at.localeCompare(b.at)),
    times: { ...f.setup.times, ...show.setup.times },
  };
  return { showId: show.id, from: f.from, taken, conflicts, newLog: newTheirs, setup };
}

/** Apply a merge, with your choice for each conflict ("theirs" or "mine"). */
export function applyMerge(p: Project, plan: MergePlan, choices: Record<string, 'mine' | 'theirs'>, who: string): Project {
  const states = { ...plan.setup.states };
  const notes: SetupData['log'] = [];
  for (const c of plan.conflicts) {
    const pick = choices[c.key] ?? 'mine';
    if (pick === 'theirs') {
      if (c.theirs) states[c.key] = c.theirs;
      else delete states[c.key];
    }
    notes.push(logEntry(who, `Conflict on “${c.title}”: kept ${pick === 'theirs' ? `${plan.from}’s` : 'mine'} (${c.mine?.status ?? 'open'} here, ${c.theirs?.status ?? 'open'} from ${plan.from})`, 'sync', c.key));
  }
  const summary = logEntry(who, `Merged progress from ${plan.from}: ${plan.taken.length} task(s) updated${plan.conflicts.length ? `, ${plan.conflicts.length} conflict(s) decided` : ''}`, 'sync');
  return mapSetup(p, plan.showId, () => ({ ...plan.setup, states, log: [...plan.setup.log, ...notes, summary] }));
}
