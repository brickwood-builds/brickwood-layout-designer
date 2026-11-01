// Shows (Phase 5B, FR-09/FR-10): dates, venue and notes, what is left out this time, the
// packing checklist (packed / loaded / unloaded / back home, each separate), vehicles or trips,
// date clashes, and a snapshot of what actually went once the show is done.
import { newId, nowIso } from './ids';
import { findItem, type Item } from './edits';
import { activeContainers, containerLabel, containerOf, contentsOf, itemName, outerContainers, outerOf, packables, volumeCuFt } from './packing';
import type { CheckStep, Container, Project, Show } from './schema';

export const STEP_LABEL: Record<CheckStep, string> = { packed: 'Packed', loaded: 'Loaded', unloaded: 'Unloaded', home: 'Back home' };
export const STEPS: CheckStep[] = ['packed', 'loaded', 'unloaded', 'home'];

export function addShow(p: Project, spec: Pick<Show, 'name' | 'start' | 'end'> & Partial<Pick<Show, 'venue' | 'notes' | 'versionName'>>): { project: Project; id: string } {
  const show: Show = {
    id: newId(),
    name: spec.name.trim() || 'Show',
    venue: spec.venue?.trim() ?? '',
    start: spec.start,
    end: spec.end < spec.start ? spec.start : spec.end,
    notes: spec.notes ?? '',
    versionName: spec.versionName ?? p.preferredVersion?.name ?? '',
    omittedIds: [],
    checklist: {},
    trips: [],
    done: false,
    createdAt: nowIso(),
  };
  return { project: { ...p, shows: [...p.shows, show] }, id: show.id };
}

const mapS = (p: Project, id: string, f: (s: Show) => Show): Project => ({ ...p, shows: p.shows.map((s) => (s.id === id ? f(s) : s)) });

export type ShowEdit = Partial<Pick<Show, 'name' | 'venue' | 'start' | 'end' | 'notes' | 'versionName'>>;
export const updateShow = (p: Project, id: string, change: ShowEdit): Project => mapS(p, id, (s) => ({ ...s, ...change }));
export const deleteShow = (p: Project, id: string): Project => ({ ...p, shows: p.shows.filter((s) => s.id !== id) });

/** Leave a thing out of this show (or bring it back). The layout itself is not changed. */
export function toggleOmit(p: Project, showId: string, itemId: string): Project {
  return mapS(p, showId, (s) => ({ ...s, omittedIds: s.omittedIds.includes(itemId) ? s.omittedIds.filter((x) => x !== itemId) : [...s.omittedIds, itemId] }));
}

/** One line of the show checklist: an outer container, or a thing that travels on its own. */
export interface ShowUnit {
  id: string;
  label: string;
  contents: string[];
  container?: Container;
  item?: Item;
}

/** What travels to this show: outer containers holding something going, and unboxed things going. */
export function showUnits(p: Project, show: Show): ShowUnit[] {
  const omitted = new Set(show.omittedIds);
  const going = packables(p).filter((i) => !omitted.has(i.id));
  const outerWithGoing = new Set<string>();
  for (const c of activeContainers(p)) {
    const hasGoing = c.itemIds.some((id) => findItem(p, id) && !omitted.has(id)) || c.equipment.length > 0;
    if (hasGoing) outerWithGoing.add(outerOf(p, c).id);
  }
  const boxes: ShowUnit[] = outerContainers(p)
    .filter((c) => outerWithGoing.has(c.id))
    .map((c) => ({ id: c.id, label: containerLabel(c), contents: contentsOf(p, c), container: c }));
  const loose: ShowUnit[] = going.filter((i) => !containerOf(p, i.id)).map((i) => ({ id: i.id, label: itemName(i), contents: [], item: i }));
  return [...boxes, ...loose];
}

/** Tick or untick one step for one unit. Ticks are separate: packed doesn't mean unloaded. */
export function setCheck(p: Project, showId: string, unitId: string, step: CheckStep, on: boolean): Project {
  return mapS(p, showId, (s) => {
    const cur = { ...(s.checklist[unitId] ?? {}) };
    if (on) cur[step] = nowIso();
    else delete cur[step];
    return { ...s, checklist: { ...s.checklist, [unitId]: cur } };
  });
}

export function progress(show: Show, units: ShowUnit[]): Record<CheckStep, number> {
  const r = { packed: 0, loaded: 0, unloaded: 0, home: 0 };
  for (const u of units) for (const step of STEPS) if (show.checklist[u.id]?.[step]) r[step]++;
  return r;
}

export function addTrip(p: Project, showId: string, name: string, capacityCuFt?: number): Project {
  if (!name.trim()) return p;
  return mapS(p, showId, (s) => ({ ...s, trips: [...s.trips, { id: newId(), name: name.trim(), ...(capacityCuFt ? { capacityCuFt } : {}), containerIds: [] }] }));
}

export const removeTrip = (p: Project, showId: string, tripId: string): Project => mapS(p, showId, (s) => ({ ...s, trips: s.trips.filter((t) => t.id !== tripId) }));

/** Put a unit on a trip (moving it off any other trip), or off all trips with null. */
export function assignTrip(p: Project, showId: string, unitId: string, tripId: string | null): Project {
  return mapS(p, showId, (s) => ({
    ...s,
    trips: s.trips.map((t) => ({ ...t, containerIds: t.id === tripId ? [...new Set([...t.containerIds, unitId])] : t.containerIds.filter((x) => x !== unitId) })),
  }));
}

export const tripOf = (show: Show, unitId: string) => show.trips.find((t) => t.containerIds.includes(unitId));

export interface TripLoad {
  trip: Show['trips'][number];
  units: ShowUnit[];
  /** Cubic feet of the containers with sizes. */
  volume: number;
  /** Units without a size (not in the volume). */
  unsized: number;
  over: boolean;
}

export function tripLoads(show: Show, units: ShowUnit[]): TripLoad[] {
  return show.trips.map((trip) => {
    const us = units.filter((u) => trip.containerIds.includes(u.id));
    let volume = 0;
    let unsized = 0;
    for (const u of us) {
      const v = u.container ? volumeCuFt(u.container) : null;
      if (v === null) unsized++;
      else volume += v;
    }
    volume = Math.round(volume * 10) / 10;
    return { trip, units: us, volume, unsized, over: !!trip.capacityCuFt && volume > trip.capacityCuFt };
  });
}

/** Shows whose dates overlap (the same display can't be at both). */
export function dateClashes(p: Project): [Show, Show][] {
  const out: [Show, Show][] = [];
  const shows = [...p.shows].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < shows.length; i++)
    for (let j = i + 1; j < shows.length; j++) {
      const [a, b] = [shows[i]!, shows[j]!];
      if (b.start <= a.end && a.start <= b.end) out.push([a, b]);
    }
  return out;
}

/** Mark the show done and keep a snapshot of what actually went (later edits don't change it). */
export function finishShow(p: Project, showId: string): Project {
  const show = p.shows.find((s) => s.id === showId);
  if (!show) return p;
  const units = showUnits(p, show);
  const snapshot = {
    at: nowIso(),
    containers: units.filter((u) => u.container).map((u) => ({ code: u.container!.code, name: u.label, contents: u.contents })),
    loose: units.filter((u) => u.item).map((u) => u.label),
    omitted: show.omittedIds.map((id) => findItem(p, id)).filter((i): i is Item => !!i).map(itemName),
  };
  return mapS(p, showId, (s) => ({ ...s, done: true, snapshot }));
}

export const reopenShow = (p: Project, showId: string): Project => mapS(p, showId, (s) => ({ ...s, done: false }));
