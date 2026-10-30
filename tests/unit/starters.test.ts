import { describe, expect, it } from 'vitest';
import { starterProjects } from '../../src/starters';
import { checkLayout } from '../../src/domain/validation';
import { ProjectSchema, isBase } from '../../src/domain/schema';
import { projectStats } from '../../src/domain/project';
import { studsToInches } from '../../src/domain/units';

const [park, kingdom] = starterProjects();

describe('starter projects from Visio CSV', () => {
  it('both starters are valid projects', () => {
    expect(ProjectSchema.safeParse(park!.project).success).toBe(true);
    expect(ProjectSchema.safeParse(kingdom!.project).success).toBe(true);
  });

  it('Adventure Park has the 12 ft v7 modules: 13×32x32, 52×16x16, 27×16x8', () => {
    const s = projectStats(park!.project);
    expect(s.modules).toBe(92);
    expect(s.modulesByKind).toEqual({ '32x32': 13, '16x16': 52, '16x8': 27 });
    const labels = park!.project.modules.filter((m) => !isBase(m)).map((m) => m.label);
    expect(new Set(labels).size).toBe(92);
    for (const l of ['AA', 'BB', 'CC', 'DD', 'EE']) expect(labels).toContain(l);
    for (const l of ['C-14', 'C-17', 'B-50', 'B-60', 'A-28']) expect(labels).not.toContain(l);
    expect(labels).toContain('C-10');
    expect(labels).not.toContain('C10');
    expect(labels.some((l) => /^B-2[4-7]$/.test(l))).toBe(false);
    expect(park!.project.retiredLabels).toEqual(['B-24', 'B-25', 'B-26', 'B-27']);
    expect(park!.project.modules.find((m) => m.label === 'C-01')!.name).toBe('Food Court');
  });

  it('Adventure Park rides are built on their own bases, with names and power', () => {
    const rides = park!.project.modules.filter(isBase);
    expect(park!.project.objects.filter((o) => o.type === 'footprint')).toEqual([]);
    for (const r of rides) {
      expect(r.label).toBe('');
      expect(r.notes).toMatch(/own base/);
    }
    const names = rides.map((r) => r.name);
    for (const n of ['Ferris Wheel', 'Timber Wolf', 'Roller Coaster', 'Carousel', 'Swings', 'Mixer', 'Blast Off', 'Green Machine', 'Bumper Cars', 'ATVs and Rafts', 'Ski Lift', 'Giant Slides', 'Entrance', 'Arcade', 'Hot Dog']) {
      expect(names).toContain(n);
    }
    expect(rides.find((r) => r.name === 'Ferris Wheel')!.powerVolts).toBe(9);
    expect(rides.find((r) => r.name === 'Green Machine')!.powerVolts).toBe(6);
    expect(rides.find((r) => r.name === 'Carousel')!.powerVolts).toBe(9);
    expect(rides).toHaveLength(16);
    for (const gone of ['Loop Coaster', 'Twisted Tracks', 'Petting Zoo', 'Carousel 2']) expect(names).not.toContain(gone);
  });

  it('the parked spare 32x32 off the v7 drawing page is left out with a note', () => {
    expect(park!.notes.some((n) => n.label === '32x32' && /off the drawing page/.test(n.message))).toBe(true);
    expect(park!.notes.filter((n) => /convention; kept as drawn/.test(n.message)).map((n) => n.label)).toEqual(['AA', 'BB', 'CC', 'DD', 'EE']);
  });

  it('Visio Y-up is flipped to app Y-down', () => {
    const o = (n: string) => park!.project.modules.find((x) => x.name === n)!;
    expect(o('Ferris Wheel').y).toBeLessThan(o('Swings').y);
    const m = (l: string) => park!.project.modules.find((x) => x.label === l)!;
    expect(m('A-01').x).toBeLessThan(m('C-11').x);
  });

  it('Kingdom has 16x16 and 32x32 village modules and the custom bases', () => {
    const p = kingdom!.project;
    const mods = p.modules;
    expect(mods.filter((m) => /^B\d\d-V$/.test(m.label))).toHaveLength(20);
    expect(mods.filter((m) => /^C\d\d-V$/.test(m.label))).toHaveLength(5);
    const size = (n: string) => {
      const m = mods.find((x) => x.name === n)!;
      return [m.width, m.depth, m.kind];
    };
    expect(size('Mountain Castle')).toEqual([64, 64, 'custom']);
    expect(size('Tavern')).toEqual([48, 48, 'custom']);
    expect(size('Farmhouse')).toEqual([32, 48, 'custom']);
    expect(size('Sentry Tower')).toEqual([32, 32, '32x32']);
    expect(size("Witch’s House")).toEqual([32, 32, '32x32']);
  });

  it('Kingdom buildings built directly on their plate are one unit with no plate ID', () => {
    const bases = kingdom!.project.modules.filter((m) => m.name);
    expect(bases).toHaveLength(14);
    for (const b of bases) {
      expect(b.label).toBe('');
      expect(b.notes).toMatch(/one unit/);
    }
    expect(new Set(kingdom!.project.modules.map((m) => m.id)).size).toBe(39);
  });

  it('every module sits on the table with no module overlaps and whole-stud positions', () => {
    for (const s of [park!, kingdom!]) {
      const warnings = checkLayout(s.project);
      expect(warnings, warnings.map((w) => w.message).join('\n')).toEqual([]);
      for (const m of s.project.modules) {
        expect(Number.isInteger(m.x) && Number.isInteger(m.y)).toBe(true);
      }
    }
  });

  it('the 12 ft Adventure Park layout starts at the left end, leaving about 4 ft of table unused', () => {
    const t = park!.project.tables[0]!;
    const right = Math.max(...park!.project.modules.map((m) => m.x + m.width), ...park!.project.objects.map((o) => o.x + o.width));
    const left = Math.min(...park!.project.modules.map((m) => m.x));
    expect(left).toBeLessThanOrEqual(3);
    const unusedFt = studsToInches(t.width - right) / 12;
    expect(unusedFt).toBeGreaterThan(3.5);
    expect(unusedFt).toBeLessThan(4.1);
  });

  it('tables match the physical surfaces', () => {
    expect(studsToInches(park!.project.tables[0]!.width)).toBeCloseTo(186, 6);
    expect(studsToInches(park!.project.tables[0]!.depth)).toBeCloseTo(42, 6);
    expect(studsToInches(kingdom!.project.tables[0]!.width)).toBeCloseTo(96, 6);
  });

  it('IDs are deterministic across loads (same physical plate, same ID)', () => {
    const again = starterProjects();
    expect(again[0]!.project.modules.map((m) => m.id)).toEqual(park!.project.modules.map((m) => m.id));
    expect(again[1]!.project.id).toBe(kingdom!.project.id);
    const ids = park!.project.modules.map((m) => m.id).concat(park!.project.objects.map((o) => o.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports every adjustment made during import', () => {
    const msgs = park!.notes.map((n) => `${n.label}: ${n.message}`).join('\n');
    expect(msgs).toMatch(/C10/);
    expect(msgs).toMatch(/connector/);
  });
});
