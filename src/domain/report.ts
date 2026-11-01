// Display report (Phase 7, FR-12.04/12.05, FR-09.07): a read-only summary of a display —
// what it is, its physical builds and open repairs, its show history (what went, setup and
// teardown times, helpers, issues), issues that keep coming back, and money spent.
import { projectStats } from './project';
import { CONDITION_LABEL, STATUS_LABEL } from './builds';
import { activeContainers, totalWeight } from './packing';
import { duration } from './setup';
import { spentTotal } from './inventory';
import { allItems, isModule } from './edits';
import type { Build, Project } from './schema';

export interface ShowLine {
  name: string;
  venue: string;
  dates: string;
  done: boolean;
  version: string;
  boxes: number;
  leftOut: string[];
  setupTime: string | null;
  teardownTime: string | null;
  helpers: string[];
  issues: { at: string; who: string; text: string }[];
  overrides: number;
}

export interface Report {
  name: string;
  generatedAt: string;
  stats: ReturnType<typeof projectStats>;
  levels: string[];
  builds: { code: string; name: string; status: string; condition: string; storage: string; progress: number }[];
  /** Builds needing repair or damaged, with their latest repair or note — visible between shows. */
  attention: { code: string; name: string; condition: string; last: string }[];
  containers: { count: number; weightLb: number | null };
  shows: ShowLine[];
  /** Things that came up in issues at more than one show. */
  recurring: { name: string; shows: string[] }[];
  spending: { total: number; bySupplier: { supplier: string; amount: number }[] };
}

const lastNote = (b: Build) => [...b.history].reverse().find((h) => h.kind === 'repair' || h.kind === 'note' || h.kind === 'condition');

export function buildReport(p: Project, now = new Date().toISOString()): Report {
  const shows = [...p.shows].sort((a, b) => b.start.localeCompare(a.start));
  const showLines: ShowLine[] = shows.map((s) => ({
    name: s.name,
    venue: s.venue,
    dates: s.start === s.end ? s.start : `${s.start} – ${s.end}`,
    done: s.done,
    version: s.versionName,
    boxes: s.snapshot?.containers.length ?? 0,
    leftOut: s.snapshot?.omitted ?? [],
    setupTime: duration(s.setup.times.setupStart, s.setup.times.setupEnd),
    teardownTime: duration(s.setup.times.teardownStart, s.setup.times.teardownEnd),
    helpers: [...new Set([...s.setup.helpers, ...s.setup.log.map((l) => l.who).filter((w) => w && w !== 'Someone')])],
    issues: s.setup.log.filter((l) => l.kind === 'issue').map((l) => ({ at: l.at, who: l.who, text: l.text })),
    overrides: s.setup.log.filter((l) => l.kind === 'override').length,
  }));

  // Names worth matching in issue text: features, named modules, builds.
  const names = new Set<string>();
  for (const i of allItems(p)) {
    if (isModule(i)) {
      if (i.name.trim().length >= 3) names.add(i.name.trim());
      if (i.label.trim()) names.add(i.label.trim());
    } else if (i.type === 'footprint' && i.name.trim().length >= 3) names.add(i.name.trim());
  }
  for (const b of p.builds) names.add(b.name);
  const recurring = [...names]
    .map((name) => ({ name, shows: showLines.filter((s) => s.issues.some((i) => i.text.toLowerCase().includes(name.toLowerCase()))).map((s) => s.name) }))
    .filter((r) => r.shows.length > 1)
    .sort((a, b) => b.shows.length - a.shows.length || a.name.localeCompare(b.name));

  const bySupplier = new Map<string, number>();
  for (const s of p.spending) bySupplier.set(s.supplier, (bySupplier.get(s.supplier) ?? 0) + s.amount);
  const boxes = activeContainers(p);
  const outer = boxes.filter((c) => !c.parentId);
  const weights = outer.map((c) => totalWeight(p, c)).filter((w): w is number => w !== null);

  return {
    name: p.name,
    generatedAt: now,
    stats: projectStats(p),
    levels: [...p.levels].sort((a, b) => a.order - b.order).map((l) => l.name),
    builds: p.builds
      .filter((b) => b.status !== 'replaced')
      .map((b) => ({ code: b.code, name: b.name, status: STATUS_LABEL[b.status], condition: CONDITION_LABEL[b.condition], storage: b.storage, progress: b.progress })),
    attention: p.builds
      .filter((b) => b.status !== 'replaced' && b.condition !== 'good')
      .map((b) => ({ code: b.code, name: b.name, condition: CONDITION_LABEL[b.condition], last: lastNote(b)?.text ?? '' })),
    containers: { count: boxes.length, weightLb: weights.length ? Math.round(weights.reduce((a, b) => a + b, 0) * 10) / 10 : null },
    shows: showLines,
    recurring,
    spending: { total: spentTotal(p), bySupplier: [...bySupplier].map(([supplier, amount]) => ({ supplier, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount) },
  };
}
