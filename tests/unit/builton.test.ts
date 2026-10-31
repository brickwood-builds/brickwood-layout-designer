import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule } from '../../src/domain/edits';
import { checkLayout } from '../../src/domain/validation';
import type { Project } from '../../src/domain/schema';

const overlaps = (p: Project) => checkLayout(p).filter((w) => w.kind === 'overlap').map((w) => w.message);

describe('built on vs overlapping', () => {
  const base = () => {
    const p = createProject({ name: 'Built on', table: { widthIn: 60, depthIn: 30 } });
    const level = p.levels[0]!.id;
    const castle = addModule(p, { levelId: level, kind: 'custom', width: 64, depth: 48, center: { x: 32, y: 24 }, exact: true, name: 'Castle Base' }, 'full');
    return { p: castle.project, level };
  };

  it('a feature entirely on a base is not an overlap; partly off it is', () => {
    const { p, level } = base();
    const on = addModule(p, { levelId: level, kind: '16x16', width: 16, depth: 16, center: { x: 20, y: 20 }, exact: true, name: 'Castle Mountain' }, 'full').project;
    expect(overlaps(on)).toEqual([]);
    const off = addModule(p, { levelId: level, kind: '16x16', width: 16, depth: 16, center: { x: 62, y: 20 }, exact: true, name: 'Castle Mountain' }, 'full').project;
    expect(overlaps(off)).toHaveLength(1);
  });

  it('a labelled MILS plate inside another plate, or two in the same spot, still overlap', () => {
    const { p, level } = base();
    const inside = addModule(p, { levelId: level, kind: '16x16', center: { x: 20, y: 20 }, exact: true }, 'full').project;
    expect(overlaps(inside)).toHaveLength(1);
    const twin = addModule(p, { levelId: level, kind: 'custom', width: 64, depth: 48, center: { x: 32, y: 24 }, exact: true, name: 'Twin' }, 'full').project;
    expect(overlaps(twin)).toHaveLength(1);
  });
});
