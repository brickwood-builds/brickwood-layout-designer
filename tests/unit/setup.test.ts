import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { addObject } from '../../src/domain/objects';
import { paintCells } from '../../src/domain/brush';
import { addShow, toggleOmit } from '../../src/domain/shows';
import { addCustomTask, applyMerge, assignTask, completeTask, duration, markTime, phaseProgress, planMerge, progressFile, reopenTask, taskViews } from '../../src/domain/setup';
import { lego } from '../../src/domain/legoColors';
import type { Project } from '../../src/domain/schema';

function park() {
  let p: Project = createProject({ name: 'Park', table: { widthIn: 60, depthIn: 30 } });
  const level = p.levels[0]!.id;
  const right = addModule(p, { levelId: level, kind: '16x16', center: { x: 40, y: 8 }, exact: true }, 'full'); // B-01, but on the right
  const left = addModule(right.project, { levelId: level, kind: '16x16', center: { x: 8, y: 8 }, exact: true }, 'full'); // B-02, on the left
  p = left.project;
  p = addObject(p, { levelId: level, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x: 4, y: 4 } }, 'full').project;
  p = addObject(p, { levelId: level, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x: 10, y: 4 } }, 'full').project;
  p = addObject(p, { levelId: level, type: 'item', name: 'Bench', width: 4, depth: 1, color: lego('Reddish Brown'), center: { x: 40, y: 4 } }, 'full').project;
  // A walkway built onto the left plate: travels fixed, not a task.
  p = paintCells(p, level, p.layers.find((l) => l.name === 'Surface details')!.id, { type: 'piece', name: 'Plate Round 1×1', width: 1, depth: 1, color: lego('Tan'), round: true }, [{ x: 1, y: 12 }]).project;
  const s = addShow(p, { name: 'Show', start: '2027-01-01', end: '2027-01-02' });
  return { p: s.project, showId: s.id, left: left.id, right: right.id };
}

const show = (p: Project) => p.shows[0]!;

describe('setup plan', () => {
  it('places modules left to right, then puts out the marked things on each; built-on pieces are not tasks', () => {
    const { p } = park();
    const setup = taskViews(p, show(p)).filter((t) => t.phase === 'setup');
    expect(setup.map((t) => t.title)).toEqual(['Place B-02', 'Place B-01', 'Put out the things on B-02', 'Put out the things on B-01']);
    expect(setup[2]!.details).toEqual(['2 × Lamp']);
    expect(setup[1]!.waitingFor).toEqual(['Place B-02']); // preferred: left to right
    expect(setup[2]!.blockedBy).toEqual(['Place B-02']); // required: plate first
  });

  it('teardown: pack up loose things first, then modules right to left', () => {
    const { p } = park();
    const td = taskViews(p, show(p)).filter((t) => t.phase === 'teardown');
    expect(td.map((t) => t.title)).toEqual(['Pack up the things on B-01', 'Pack up the things on B-02', 'Pack up B-01', 'Pack up B-02']);
    expect(td[2]!.blockedBy).toEqual(['Pack up the things on B-01']);
  });

  it('things left out of the show drop out of the plan', () => {
    const { p, showId, right } = park();
    const q = toggleOmit(p, showId, right);
    expect(taskViews(q, show(q)).filter((t) => t.phase === 'setup').map((t) => t.title)).toEqual(['Place B-02', 'Put out the things on B-02']);
  });

  it('a required step before needs a reason to skip, and the override is logged', () => {
    const { p, showId } = park();
    const loose = taskViews(p, show(p)).find((t) => t.title === 'Put out the things on B-02')!;
    expect(completeTask(p, showId, loose, 'Ann')).toBeNull();
    const q = completeTask(p, showId, loose, 'Ann', 'Plate was already down')!;
    const v = taskViews(q, show(q)).find((t) => t.key === loose.key)!;
    expect(v).toMatchObject({ status: 'done', by: 'Ann', overridden: true });
    expect(show(q).setup.log.map((l) => [l.who, l.kind])).toEqual([
      ['Ann', 'task'],
      ['Ann', 'override'],
    ]);
  });

  it('helpers: assign, claim, complete, reopen; own tasks go after the one they follow', () => {
    const { p, showId } = park();
    const [first] = taskViews(p, show(p));
    let q = assignTask(p, showId, first!, 'Bob', 'Jen');
    expect(taskViews(q, show(q))[0]).toMatchObject({ status: 'assigned', helper: 'Bob' });
    q = assignTask(q, showId, first!, 'Bob', 'Bob');
    expect(taskViews(q, show(q))[0]!.status).toBe('claimed');
    q = completeTask(q, showId, taskViews(q, show(q))[0]!, 'Bob')!;
    q = reopenTask(q, showId, first!, 'Jen');
    expect(taskViews(q, show(q))[0]!.status).toBe('open');
    q = addCustomTask(q, showId, 'Plug in ride power', 'setup', first!.key, true);
    const views = taskViews(q, show(q));
    expect(views[1]).toMatchObject({ title: 'Plug in ride power', kind: 'custom', blockedBy: ['Place B-02'] });
    expect(phaseProgress(views, 'setup')).toEqual({ done: 0, total: 5 });
  });

  it('timing is recorded', () => {
    const { p, showId } = park();
    const q = markTime(p, showId, 'setupStart', 'Jen');
    expect(show(q).setup.times.setupStart).toBeTruthy();
    expect(duration('2027-01-01T08:00:00.000Z', '2027-01-01T09:25:00.000Z')).toBe('1 h 25 min');
  });
});


describe('helpers on their own devices', () => {
  it('a helper’s ticks merge in; a task both changed differently is a conflict you decide', () => {
    const { p, showId } = park();
    const tasks = taskViews(p, show(p));
    const [a, b] = tasks;
    // The helper got the layout file, then ticked A and B on their own tablet.
    let helper = completeTask(p, showId, a!, 'Bob')!;
    helper = completeTask(helper, showId, taskViews(helper, show(helper))[1]!, 'Bob')!;
    // Meanwhile the organiser reopened nothing for A, but assigned B to Ann.
    const mine = assignTask(p, showId, b!, 'Ann', 'Jen');
    const file = JSON.stringify(progressFile(helper, showId, 'Bob'));
    const plan = planMerge(mine, file);
    expect(plan.taken).toEqual([a!.key]);
    expect(plan.conflicts.map((c) => [c.title, c.mine?.status, c.theirs?.status])).toEqual([[b!.title, 'assigned', 'done']]);
    const merged = applyMerge(mine, plan, { [b!.key]: 'theirs' }, 'Jen');
    const views = taskViews(merged, show(merged));
    expect(views[0]).toMatchObject({ status: 'done', by: 'Bob' });
    expect(views[1]).toMatchObject({ status: 'done', by: 'Bob' });
    expect(show(merged).setup.log.filter((l) => l.kind === 'sync').map((l) => l.text)).toEqual([
      `Conflict on “${b!.title}”: kept Bob’s (assigned here, done from Bob)`,
      'Merged progress from Bob: 1 task(s) updated, 1 conflict(s) decided',
    ]);
    // Merging the same file again changes nothing.
    const again = planMerge(merged, file);
    expect(again.taken).toEqual([]);
    expect(again.conflicts).toEqual([]);
  });

  it('a file for another layout or not a progress file is refused', () => {
    const { p } = park();
    expect(() => planMerge(p, '{}')).toThrow(/isn’t a helper progress file/);
    const other = park();
    expect(() => planMerge(p, JSON.stringify(progressFile(other.p, other.showId, 'Bob')))).toThrow(/doesn’t have the show/);
  });
});
