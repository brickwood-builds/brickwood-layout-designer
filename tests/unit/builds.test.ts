import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { addObject } from '../../src/domain/objects';
import { addHistory, addMilestone, buildOfItem, createBuild, deleteBuild, dismantle, nextBuildCode, rebuild, replaceBuild, toggleMilestone, updateBuild } from '../../src/domain/builds';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { lego } from '../../src/domain/legoColors';

function castle() {
  const p = createProject({ name: 'Kingdom', table: { widthIn: 60, depthIn: 40 } });
  const level = p.levels[0]!.id;
  const base = addModule(p, { levelId: level, kind: 'custom', width: 64, depth: 48, center: { x: 40, y: 30 }, exact: true, name: 'Castle Base' }, 'full');
  const tower = addObject(base.project, { levelId: level, type: 'item', name: 'Tower', width: 8, depth: 8, color: lego('Light Bluish Gray'), center: { x: 30, y: 20 } }, 'full');
  return { p: tower.project, ids: [base.id, tower.id] };
}

describe('physical builds', () => {
  it('tracking gives a permanent ID; things already in a build are not taken twice', () => {
    const { p, ids } = castle();
    const r = createBuild(p, ids, 'Castle')!;
    const b = r.project.builds[0]!;
    expect(b).toMatchObject({ code: 'PB-001', name: 'Castle', status: 'built', condition: 'good', progress: 100 });
    expect(buildOfItem(r.project, ids[1]!)?.id).toBe(b.id);
    expect(createBuild(r.project, ids, 'Again')).toBeNull();
    expect(nextBuildCode(r.project)).toBe('PB-002');
  });

  it('status, condition and storage changes and repairs go into the history', () => {
    const { p, ids } = castle();
    const r = createBuild(p, ids, 'Castle')!;
    let q = updateBuild(r.project, r.buildId, { condition: 'needs-repair', storage: 'Garage shelf 3' });
    q = addHistory(q, r.buildId, 'repair', 'Reattached the drawbridge', true);
    const b = q.builds[0]!;
    expect(b.condition).toBe('good');
    expect(b.storage).toBe('Garage shelf 3');
    expect(b.history.map((h) => h.kind)).toEqual(['created', 'condition', 'storage', 'repair', 'condition']);
  });

  it('milestones drive progress', () => {
    const { p, ids } = castle();
    const r = createBuild(p, ids, 'Mountain', 'building')!;
    let q = addMilestone(r.project, r.buildId, 'Base terrain');
    q = addMilestone(q, r.buildId, 'Walls');
    q = toggleMilestone(q, r.buildId, q.builds[0]!.milestones[0]!.id);
    expect(q.builds[0]!.progress).toBe(50);
    q = updateBuild(q, r.buildId, { status: 'built' });
    expect(q.builds[0]!.progress).toBe(100);
  });

  it('rebuilt keeps the ID; replaced gets a new one and the old record stays', () => {
    const { p, ids } = castle();
    const r = createBuild(p, ids, 'Castle')!;
    let q = rebuild(r.project, r.buildId, 'New gatehouse');
    expect(q.builds[0]).toMatchObject({ code: 'PB-001', status: 'building' });
    q = dismantle(q, r.buildId, true, 'Towers off for transport');
    expect(q.builds[0]!.status).toBe('partly-dismantled');
    const rep = replaceBuild(q, r.buildId, 'Water damage')!;
    const [old, fresh] = rep.project.builds;
    expect(old).toMatchObject({ code: 'PB-001', status: 'replaced', replacedBy: fresh!.id });
    expect(fresh).toMatchObject({ code: 'PB-002', replaces: old!.id, itemIds: ids, status: 'building' });
    expect(buildOfItem(rep.project, ids[0]!)?.code).toBe('PB-002');
    expect(old!.history.length).toBeGreaterThan(3);
    // Stop tracking is only for mistakes, so a mistaken record's code can be given out again.
    expect(nextBuildCode(deleteBuild(rep.project, fresh!.id))).toBe('PB-002');
  });

  it('builds travel with the project file; older files open with none', () => {
    const { p, ids } = castle();
    const r = createBuild(p, ids, 'Castle')!;
    expect(parseProjectFile(exportProject(r.project)).builds).toEqual(r.project.builds);
    const old = JSON.parse(exportProject(p)) as { project: Record<string, unknown> };
    delete old.project.builds;
    delete (old.project.features as Record<string, unknown>).builds;
    const back = parseProjectFile(JSON.stringify(old));
    expect(back.builds).toEqual([]);
    expect(back.features.builds).toBe(false);
  });
});
