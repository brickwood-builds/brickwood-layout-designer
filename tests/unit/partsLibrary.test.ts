import { describe, expect, it } from 'vitest';
import doc from '../../src/data/parts-catalog.json';
import { buildLibrary, defaultColorName, libraryTemplate, searchLibrary } from '../../src/domain/partsLibrary';
import { STARTER_PARTS } from '../../src/domain/catalog';
import { createProject } from '../../src/domain/project';
import { addObject } from '../../src/domain/objects';
import { computeStack } from '../../src/domain/heights';
import { lego } from '../../src/domain/legoColors';

const lib = buildLibrary(doc as never);

describe('parts library', () => {
  it('has the common parts with sizes, heights, studs and colours', () => {
    expect(lib.parts.length).toBeGreaterThan(2000);
    expect(lib.byNo.get('3020')).toMatchObject({ name: 'Plate 2×4', width: 4, depth: 2, height: 1, smooth: false, sizeKnown: true });
    expect(lib.byNo.get('3070b')).toMatchObject({ smooth: true, height: 1 });
    expect(lib.byNo.get('6141')).toMatchObject({ round: true, width: 1, depth: 1 });
    expect(lib.byNo.get('3001')).toMatchObject({ height: 3 });
    expect(lib.byNo.get('3024')!.colors).toContain('Light Bluish Gray');
  });

  it('every built-in part is in the library under its Rebrickable number', () => {
    for (const p of STARTER_PARTS) {
      const hit = lib.byNo.get(p.rbNo!);
      expect(hit, p.name).toBeDefined();
      expect([hit!.width, hit!.depth]).toEqual([p.width, p.depth]);
    }
  });

  it('search by size, words or part number; part number first', () => {
    expect(searchLibrary(lib, 'plate 2x4').parts[0]!.partNo).toBe('3020');
    expect(searchLibrary(lib, 'Plate 2×4').parts[0]!.partNo).toBe('3020');
    expect(searchLibrary(lib, '3024').parts[0]!.partNo).toBe('3024');
    expect(searchLibrary(lib, 'bush').parts.some((p) => /Bush/.test(p.name))).toBe(true);
    const many = searchLibrary(lib, 'plate', 10);
    expect(many.parts).toHaveLength(10);
    expect(many.total).toBeGreaterThan(10);
  });

  it('placing a part keeps its number, size, smoothness and height; plants start green', () => {
    const tile = lib.byNo.get('3068b')!;
    const t = libraryTemplate(tile);
    expect(t).toMatchObject({ catalogKey: 'rb:3068b', width: 2, depth: 2, smooth: true, heightPlates: 1 });
    const p = createProject({ name: 'Parts', table: { widthIn: 20, depthIn: 20 } });
    const r = addObject(p, { ...t, levelId: p.levels[0]!.id, center: { x: 5, y: 5 } }, 'full');
    expect(computeStack(r.project, p.levels[0]!.id).get(r.id)!.top).toBe(1);
    const bush = searchLibrary(lib, 'bush').parts[0]!;
    expect(['Green', 'Bright Green', 'Dark Green']).toContain(defaultColorName(bush));
    expect(libraryTemplate(bush, 'Dark Green').color).toBe(lego('Dark Green'));
  });
});
