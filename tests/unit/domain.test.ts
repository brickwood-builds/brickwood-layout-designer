import { describe, expect, it } from 'vitest';
import { createProject, duplicateProject } from '../../src/domain/project';
import { migrateProject, ProjectFormatError } from '../../src/domain/migrations';
import { footprint, rectsOverlap, snap } from '../../src/domain/geometry';
import { checkLayout } from '../../src/domain/validation';
import { formatFeetInches, inchesToStuds, studsToInches } from '../../src/domain/units';
import { stableId } from '../../src/domain/stableId';
import { newId } from '../../src/domain/ids';
import { ProjectSchema, milsKindForSize, type MilsModule, type Project } from '../../src/domain/schema';

function addModule(p: Project, label: string, x: number, y: number, size = 32): MilsModule {
  const m: MilsModule = {
    id: newId(), levelId: p.levels[0]!.id, layerId: p.layers[0]!.id, kind: milsKindForSize(size, size),
    label, name: '', x, y, width: size, depth: size, rotation: 0, notes: '',
  };
  p.modules.push(m);
  return m;
}

describe('units', () => {
  it('uses the exact 8 mm stud', () => {
    expect(studsToInches(32)).toBeCloseTo(10.0787, 3);
    expect(inchesToStuds(96)).toBeCloseTo(304.8, 6);
    expect(formatFeetInches(inchesToStuds(42))).toBe('3 ft 6 in');
  });
});

describe('ids', () => {
  it('stableId is deterministic, unique per seed and a valid UUID', () => {
    expect(stableId('a')).toBe(stableId('a'));
    expect(stableId('a')).not.toBe(stableId('b'));
    const p = createProject({ name: 'x' });
    expect(ProjectSchema.safeParse({ ...p, id: stableId('seed') }).success).toBe(true);
  });
});

describe('project model', () => {
  it('new project has one level, one layer, a table and default (hidden) advanced features', () => {
    const p = createProject({ name: '  Test  ', table: { widthIn: 96, depthIn: 42 } });
    expect(p.name).toBe('Test');
    expect(p.levels).toHaveLength(1);
    expect(p.tables[0]!.width).toBeCloseTo(304.8);
    expect(Object.values(p.features).every((v) => v === false)).toBe(true);
    expect(ProjectSchema.parse(p)).toEqual(p);
  });

  it('duplicate gets a new project ID but keeps module identities', () => {
    const p = createProject({ name: 'A' });
    const m = addModule(p, 'C-01', 0, 0);
    const d = duplicateProject(p);
    expect(d.id).not.toBe(p.id);
    expect(d.name).toBe('A (copy)');
    expect(d.modules[0]!.id).toBe(m.id);
    expect(d.revision).toBe(0);
  });

  it('keeps decimal and negative stud coordinates exactly', () => {
    const p = createProject({ name: 'A' });
    addModule(p, 'C-01', -12.5, 3.25);
    const back = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(back.modules[0]!.x).toBe(-12.5);
    expect(back.modules[0]!.y).toBe(3.25);
  });
});

describe('migrations and validation', () => {
  it('rejects non-objects, missing versions and future versions with readable errors', () => {
    expect(() => migrateProject(null)).toThrow(ProjectFormatError);
    expect(() => migrateProject({ name: 'x' })).toThrow(/schema version/);
    const p = createProject({ name: 'x' });
    expect(() => migrateProject({ ...p, schemaVersion: 99 })).toThrow(/newer version/);
  });

  it('rejects damaged documents and lists the problems', () => {
    const p = createProject({ name: 'x' });
    try {
      migrateProject({ ...p, levels: [], modules: [{ id: 'nope' }] });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectFormatError);
      expect((e as ProjectFormatError).details.join(' ')).toMatch(/levels/);
    }
  });
});

describe('geometry', () => {
  it('rotation swaps the footprint', () => {
    expect(footprint({ x: 1, y: 2, width: 32, depth: 48, rotation: 90 })).toEqual({ x: 1, y: 2, width: 48, depth: 32 });
    expect(footprint({ x: 1, y: 2, width: 32, depth: 48, rotation: 180 })).toEqual({ x: 1, y: 2, width: 32, depth: 48 });
  });

  it('touching edges are not overlaps', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 32, depth: 32 }, { x: 32, y: 0, width: 32, depth: 32 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, width: 32, depth: 32 }, { x: 31.5, y: 0, width: 32, depth: 32 })).toBe(true);
  });

  it('snaps to full, half or free', () => {
    expect(snap(3.3, 'full')).toBe(3);
    expect(snap(3.3, 'half')).toBe(3.5);
    expect(snap(3.3, 'free')).toBe(3.3);
  });

  it('2×2 arrangement of 32×32 MILS on a table has no warnings', () => {
    const p = createProject({ name: '2x2', table: { widthIn: 24, depthIn: 24 } });
    addModule(p, 'C-01', 0, 0);
    addModule(p, 'C-02', 32, 0);
    addModule(p, 'C-03', 0, 32);
    addModule(p, 'C-04', 32, 32);
    expect(checkLayout(p)).toEqual([]);
  });

  it('unlabelled plates (buildings built on their plate) are not duplicate IDs', () => {
    const p = createProject({ name: 'k', table: { widthIn: 24, depthIn: 24 } });
    addModule(p, '', 0, 0).name = 'Tavern';
    addModule(p, '', 32, 0).name = 'Church';
    expect(checkLayout(p)).toEqual([]);
  });

  it('warns about overhang, overlap, duplicate and retired labels without changing anything', () => {
    const p = createProject({ name: 'w', table: { widthIn: 12, depthIn: 12 } });
    addModule(p, 'C-01', 0, 0);
    addModule(p, 'c-01', 16, 0);
    addModule(p, 'B-24', -4, 34, 16);
    p.retiredLabels = ['B-24'];
    const before = structuredClone(p);
    const kinds = checkLayout(p).map((w) => w.kind).sort();
    expect(kinds).toEqual(['duplicateLabel', 'overhang', 'overhang', 'overlap', 'retiredLabel']);
    expect(checkLayout(p).find((w) => w.kind === 'overhang')!.message).toMatch(/Table/);
    expect(p).toEqual(before);
  });
});
