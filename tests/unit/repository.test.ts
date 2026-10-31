import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, type BrickwoodDb } from '../../src/storage/db';
import { ProjectRepository, RevisionConflictError, CHECKPOINT_INTERVAL_MS, MAX_CHECKPOINTS_PER_PROJECT } from '../../src/storage/repository';
import { createProject } from '../../src/domain/project';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { ProjectFormatError } from '../../src/domain/migrations';
import { LEGACY_STARTER_IDS, starterProjects } from '../../src/starters';

let dbName: string;
let db: BrickwoodDb;
let repo: ProjectRepository;

beforeEach(() => {
  dbName = `test-${crypto.randomUUID()}`;
  db = openDb(dbName);
  repo = new ProjectRepository(db);
});

afterEach(async () => {
  db.close();
  await db.delete();
  vi.useRealTimers();
});

function reopen() {
  db.close();
  db = openDb(dbName);
  repo = new ProjectRepository(db);
}

describe('project persistence', () => {
  it('survives close and reopen with settings intact', async () => {
    const p = createProject({ name: 'Persist', table: { widthIn: 96, depthIn: 42 } });
    p.settings.displayUnit = 'cm';
    await repo.createProject(p);
    reopen();
    const back = await repo.getProject(p.id);
    expect(back).toEqual(p);
  });

  it('rename, archive and duplicate', async () => {
    const p = await repo.createProject(createProject({ name: 'One' }));
    const renamed = await repo.rename(p.id, '  Two ');
    expect(renamed.name).toBe('Two');
    expect(renamed.revision).toBe(1);
    expect(renamed.revisionId).not.toBe(p.revisionId);

    const dup = await repo.duplicate(p.id);
    await repo.setArchived(p.id, true);
    const active = await repo.listProjects();
    expect(active.projects.map((x) => x.name)).toEqual(['Two (copy)']);
    const all = await repo.listProjects({ includeArchived: true });
    expect(all.projects).toHaveLength(2);
    expect(dup.id).not.toBe(p.id);
  });

  it('rejects a save based on a stale revision (no silent overwrite)', async () => {
    const p = await repo.createProject(createProject({ name: 'A' }));
    await repo.saveProject({ ...p, name: 'Tab 1' });
    await expect(repo.saveProject({ ...p, name: 'Tab 2' })).rejects.toBeInstanceOf(RevisionConflictError);
    expect((await repo.getProject(p.id)).name).toBe('Tab 1');
  });

  it('an interrupted save leaves the previous version intact', async () => {
    const p = await repo.createProject(createProject({ name: 'Before' }));
    await expect(
      repo.saveProject({ ...p, name: 'After' }, { checkpointReason: 'x', beforeCommit: () => { throw new Error('power cut'); } }),
    ).rejects.toThrow('power cut');
    reopen();
    const back = await repo.getProject(p.id);
    expect(back.name).toBe('Before');
    expect(back.revision).toBe(0);
    expect(await repo.listCheckpoints(p.id)).toEqual([]);
  });

  it('refuses invalid data at the storage boundary', async () => {
    const p = await repo.createProject(createProject({ name: 'A' }));
    await expect(repo.saveProject({ ...p, name: '   ' })).rejects.toThrow();
    expect((await repo.getProject(p.id)).name).toBe('A');
  });
});

describe('checkpoints and recovery', () => {
  it('first save creates an automatic checkpoint, later ones only after the interval', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const p = await repo.createProject(createProject({ name: 'v0' }));
    let cur = await repo.saveProject({ ...p, name: 'v1' });
    cur = await repo.saveProject({ ...cur, name: 'v2' });
    expect(await repo.listCheckpoints(p.id)).toHaveLength(1);
    vi.setSystemTime(Date.now() + CHECKPOINT_INTERVAL_MS + 1);
    await repo.saveProject({ ...cur, name: 'v3' });
    const cps = await repo.listCheckpoints(p.id);
    expect(cps).toHaveLength(2);
    expect((await repo.previewCheckpoint(cps[0]!.id)).name).toBe('v2');
  });

  it('restore can be previewed, keeps the project ID, and can itself be undone', async () => {
    const p = await repo.createProject(createProject({ name: 'Good' }));
    const cp = await repo.checkpoint(p.id, 'Before risky change');
    await repo.saveProject({ ...p, name: 'Bad' });

    const preview = await repo.previewCheckpoint(cp.id);
    expect(preview.name).toBe('Good');
    expect((await repo.getProject(p.id)).name).toBe('Bad'); // preview changes nothing

    const restored = await repo.restoreCheckpoint(cp.id);
    expect(restored.id).toBe(p.id);
    expect(restored.name).toBe('Good');
    expect(restored.revision).toBe(2);

    const before = (await repo.listCheckpoints(p.id)).find((c) => c.reason === 'Before restore')!;
    expect((await repo.previewCheckpoint(before.id)).name).toBe('Bad');
  });

  it('keeps a bounded number of checkpoints', async () => {
    const p = await repo.createProject(createProject({ name: 'A' }));
    for (let i = 0; i < MAX_CHECKPOINTS_PER_PROJECT + 5; i++) await repo.checkpoint(p.id, `cp ${i}`);
    expect(await repo.listCheckpoints(p.id)).toHaveLength(MAX_CHECKPOINTS_PER_PROJECT);
  });

  it('a damaged stored project is reported, not hidden, and can be restored from a checkpoint', async () => {
    const p = await repo.createProject(createProject({ name: 'Precious' }));
    const cp = await repo.checkpoint(p.id, 'manual');
    await db.projects.update(p.id, { doc: { schemaVersion: 1, id: p.id, garbage: true } });

    const list = await repo.listProjects();
    expect(list.projects).toHaveLength(0);
    expect(list.damaged).toHaveLength(1);
    expect(list.damaged[0]!.hasCheckpoint).toBe(true);

    await repo.restoreCheckpoint(cp.id);
    const fixed = await repo.listProjects();
    expect(fixed.damaged).toHaveLength(0);
    expect(fixed.projects[0]!.name).toBe('Precious');
  });
});

describe('export / import', () => {
  it('round trip preserves every ID and coordinate', async () => {
    const [park] = starterProjects();
    const text = exportProject(park!.project);
    const parsed = parseProjectFile(text);
    expect(parsed).toEqual(park!.project);

    const { project, importedAsCopy } = await repo.importProject(parsed);
    expect(importedAsCopy).toBe(false);
    reopen();
    expect(await repo.getProject(project.id)).toEqual(park!.project);
  });

  it('importing a project that already exists creates a copy and never overwrites', async () => {
    const original = await repo.createProject(createProject({ name: 'Mine' }));
    await repo.rename(original.id, 'Mine (edited)');
    const { project, importedAsCopy } = await repo.importProject(parseProjectFile(exportProject(original)));
    expect(importedAsCopy).toBe(true);
    expect(project.id).not.toBe(original.id);
    expect(project.name).toBe('Mine (imported)');
    expect((await repo.getProject(original.id)).name).toBe('Mine (edited)');
  });

  it('rejects invalid files with readable messages', () => {
    expect(() => parseProjectFile('not json')).toThrow(/not valid JSON/);
    expect(() => parseProjectFile('{"hello":1}')).toThrow(/not a Brickwood/);
    expect(() => parseProjectFile(JSON.stringify({ format: 'brickwood-layout-project', formatVersion: 9 }))).toThrow(/newer version/);
    const broken = JSON.parse(exportProject(createProject({ name: 'x' })));
    broken.project.modules = [{ label: 'C-01' }];
    expect(() => parseProjectFile(JSON.stringify(broken))).toThrow(ProjectFormatError);
  });
});

describe('starter seeding', () => {
  it('adds each starter once; archived starters are not re-added', async () => {
    const starters = starterProjects().map((s) => s.project);
    expect(starters.map((p) => p.name)).toEqual(['Brickwood Adventure Park', 'Brickwood Kingdom (Village)', 'Development']);
    expect(await repo.seedStarters(starters)).toBe(3);
    await repo.setArchived(starters[0]!.id, true);
    expect(await repo.seedStarters(starters)).toBe(0);
    const { projects } = await repo.listProjects();
    expect(projects.map((p) => p.name).sort()).toEqual(['Brickwood Kingdom (Village)', 'Development']);
  });

  it('a browser seeded by the earlier version gets only the new Development layout', async () => {
    const [park, kingdom, dev] = starterProjects().map((s) => s.project);
    await repo.createProject(kingdom!); // the Park was deleted by the user; it must not come back
    await db.meta.put({ key: 'startersSeeded', value: '2026-10-30T22:00:00.000Z' });
    expect(await repo.seedStarters([park!, kingdom!, dev!], LEGACY_STARTER_IDS)).toBe(1);
    const { projects } = await repo.listProjects();
    expect(projects.map((p) => p.name).sort()).toEqual(['Brickwood Kingdom (Village)', 'Development']);
    expect(await repo.seedStarters([park!, kingdom!, dev!], LEGACY_STARTER_IDS)).toBe(0);
  });

  it('only the Adventure Park project brings setup markers; new projects start with none', async () => {
    const [park, kingdom, dev] = starterProjects().map((s) => s.project);
    expect(park!.shapes.filter((sh) => sh.type === 'setupMarker')).toHaveLength(9);
    expect(kingdom!.shapes).toEqual([]);
    expect(dev!.shapes).toEqual([]);
    expect(dev!.layers.map((l) => l.name)).toEqual(['Table, modules & bases', 'Surface details', 'Markers & small items']);
    expect(dev!.modules).toEqual([]);
  });
});
