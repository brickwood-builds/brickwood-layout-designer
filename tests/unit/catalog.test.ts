import { describe, expect, it } from 'vitest';
import { COMMON_PART_KEYS, STARTER_PARTS, partByKey, searchParts } from '../../src/domain/catalog';
import { defaultHeight } from '../../src/domain/heights';
import { legoColorName } from '../../src/domain/legoColors';
import { addShape } from '../../src/domain/objects';
import { createProject } from '../../src/domain/project';
import type { CanvasObject } from '../../src/domain/schema';

const obj = (o: Partial<CanvasObject>): CanvasObject => ({
  id: crypto.randomUUID(), levelId: crypto.randomUUID(), layerId: crypto.randomUUID(), type: 'piece', name: 'x',
  x: 0, y: 0, width: 1, depth: 1, rotation: 0, color: '#ffffff', notes: '', ...o,
});

describe('built-in parts', () => {
  it('has the common plates, tiles, bricks and rounds, with unique keys, LEGO colours and part numbers', () => {
    expect(STARTER_PARTS.length).toBeGreaterThanOrEqual(55);
    expect(new Set(STARTER_PARTS.map((p) => p.key)).size).toBe(STARTER_PARTS.length);
    for (const p of STARTER_PARTS) {
      expect(legoColorName(p.color)).toBeTruthy();
      expect(p.partNo).toBeTruthy();
    }
    for (const k of COMMON_PART_KEYS) expect(partByKey(k)).toBeTruthy();
  });

  it('keeps the keys used by pieces placed before (no broken links)', () => {
    for (const k of ['brick-1x2', 'brick-1x4', 'brick-2x2', 'brick-2x4', 'plate-1x2', 'plate-2x2', 'plate-2x4', 'plate-4x4', 'tile-1x2', 'tile-2x2', 'round-1x1', 'round-2x2']) {
      expect(partByKey(k), k).toBeTruthy();
    }
  });

  it('plates have studs, tiles are smooth; heights come from the part', () => {
    expect(partByKey('plate-2x2')).toMatchObject({ name: 'Plate 2×2', studs: true, height: 1, partNo: '3022' });
    expect(partByKey('tile-2x2')).toMatchObject({ name: 'Tile 2×2', studs: false, partNo: '3068b' });
    expect(partByKey('plate-2x4')).toMatchObject({ width: 4, depth: 2 });
    expect(defaultHeight(obj({ catalogKey: 'brick-2x4' }))).toBe(3);
    expect(defaultHeight(obj({ catalogKey: 'roundtile-1x1' }))).toBe(1);
  });

  it('search by words, size or part number', () => {
    expect(searchParts('tile 2x2').map((p) => p.name)).toEqual(['Tile 2×2', 'Tile Round 2×2']);
    expect(searchParts('3024').map((p) => p.name)).toEqual(['Plate 1×1']);
    expect(searchParts('').map((p) => p.key)).toEqual(STARTER_PARTS.filter((p) => COMMON_PART_KEYS.includes(p.key)).map((p) => p.key));
    expect(searchParts('nothing like this')).toEqual([]);
  });

  it('a made-up piece can be smooth (a tile without studs)', () => {
    const p = createProject({ name: 'x' });
    const r = addShape(p, { name: 'Tile 1×10 (custom)', type: 'piece', width: 10, depth: 1, color: '#ffffff', smooth: true });
    expect(r.project.shapes[0]).toMatchObject({ smooth: true });
    expect(addShape(p, { name: 'Plate', type: 'piece', width: 1, depth: 1, color: '#ffffff' }).project.shapes[0]).not.toHaveProperty('smooth');
  });
});
