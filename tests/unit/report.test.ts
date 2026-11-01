import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { addShow, finishShow } from '../../src/domain/shows';
import { logIssue, markTime } from '../../src/domain/setup';
import { addHistory, createBuild, updateBuild } from '../../src/domain/builds';
import { buildReport } from '../../src/domain/report';
import type { Project } from '../../src/domain/schema';

describe('display report', () => {
  it('open repairs, show history with times and issues, recurring issues, spending', () => {
    let p: Project = createProject({ name: 'Park', table: { widthIn: 60, depthIn: 30 } });
    const wheel = addModule(p, { levelId: p.levels[0]!.id, kind: '32x32', width: 32, depth: 32, center: { x: 16, y: 16 }, exact: true, name: 'Ferris Wheel' }, 'full');
    p = wheel.project;
    const b = createBuild(p, [wheel.id], 'Ferris Wheel')!;
    p = updateBuild(b.project, b.buildId, { condition: 'needs-repair' });
    p = addHistory(p, b.buildId, 'note', 'Motor gear slipping');
    for (const [name, start] of [
      ['Spring show', '2027-04-10'],
      ['BrickFair', '2027-08-05'],
    ] as const) {
      const s = addShow(p, { name, start, end: start });
      p = markTime(s.project, s.id, 'setupStart', 'Jen');
      p = { ...p, shows: p.shows.map((x) => (x.id === s.id ? { ...x, setup: { ...x.setup, times: { setupStart: `${start}T08:00:00.000Z`, setupEnd: `${start}T10:15:00.000Z` } } } : x)) };
      p = logIssue(p, s.id, 'Bob', 'Ferris wheel motor stalled');
      p = finishShow(p, s.id);
    }
    p = { ...p, spending: [{ id: crypto.randomUUID(), date: '2027-01-01', supplier: 'BrickLink', note: '', amount: 30.5 }] };
    const r = buildReport(p, '2027-09-01T00:00:00.000Z');
    expect(r.attention).toEqual([{ code: 'PB-001', name: 'Ferris Wheel', condition: 'Needs repair', last: 'Motor gear slipping' }]);
    expect(r.shows.map((s) => [s.name, s.setupTime, s.issues.length, s.helpers])).toEqual([
      ['BrickFair', '2 h 15 min', 1, ['Jen', 'Bob']],
      ['Spring show', '2 h 15 min', 1, ['Jen', 'Bob']],
    ]);
    expect(r.recurring).toEqual([{ name: 'Ferris Wheel', shows: ['BrickFair', 'Spring show'] }]);
    expect(r.spending.total).toBe(30.5);
  });
});
