import { describe, expect, it } from 'vitest';
import { starterProjects } from '../../src/starters';
import { checkLayout, footprint } from '../../src/domain/geometry';
import { ProjectSchema } from '../../src/domain/schema';
import { projectStats } from '../../src/domain/project';
import { studsToInches } from '../../src/domain/units';

const [park, kingdom] = starterProjects();

describe('starter projects from Visio CSV', () => {
  it('both starters are valid projects', () => {
    expect(ProjectSchema.safeParse(park!.project).success).toBe(true);
    expect(ProjectSchema.safeParse(kingdom!.project).success).toBe(true);
  });

  it('Adventure Park has the current v5 modules: 17×32x32, 56×16x16, 31×16x8', () => {
    const s = projectStats(park!.project);
    expect(s.modules).toBe(104);
    expect(s.modulesByKind).toEqual({ '32x32': 17, '16x16': 56, '16x8': 31 });
    const labels = park!.project.modules.map((m) => m.label);
    expect(new Set(labels).size).toBe(104);
    expect(labels).toContain('C-10');
    expect(labels).not.toContain('C10');
    expect(labels.some((l) => /^B-2[4-7]$/.test(l))).toBe(false);
    expect(park!.project.retiredLabels).toEqual(['B-24', 'B-25', 'B-26', 'B-27']);
    expect(park!.project.modules.find((m) => m.label === 'C-01')!.name).toBe('Food Court');
  });

  it('Adventure Park ride footprints carry names and power', () => {
    const rides = park!.project.objects.filter((o) => o.type === 'footprint');
    const names = rides.map((r) => r.name);
    for (const n of ['Ferris Wheel', 'Timber Wolf', 'Roller Coaster', 'Loop Coaster', 'Twisted Tracks', 'Carousel', 'Carousel 2', 'Swings', 'Mixer', 'Blast Off', 'Green Machine', 'Bumper Cars', 'ATVs and Rafts', 'Ski Lift', 'Giant Slides', 'Petting Zoo', 'Entrance', 'Arcade', 'Hot Dog']) {
      expect(names).toContain(n);
    }
    expect(rides.find((r) => r.name === 'Ferris Wheel')!.powerVolts).toBe(9);
    expect(rides.find((r) => r.name === 'Green Machine')!.powerVolts).toBe(6);
    // Carousel 2 is rotated 90° in the drawing: 15 in wide on screen.
    const c2 = rides.find((r) => r.name === 'Carousel 2')!;
    expect(footprint(c2).width).toBe(48);
    expect(footprint(c2).depth).toBe(32);
  });

  it('Visio Y-up is flipped to app Y-down', () => {
    const o = (n: string) => park!.project.objects.find((x) => x.name === n)!;
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

  it('every module sits on the table with no module overlaps and whole-stud positions', () => {
    for (const s of [park!, kingdom!]) {
      const warnings = checkLayout(s.project);
      expect(warnings, warnings.map((w) => w.message).join('\n')).toEqual([]);
      for (const m of s.project.modules) {
        expect(Number.isInteger(m.x) && Number.isInteger(m.y)).toBe(true);
      }
    }
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
