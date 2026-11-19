// BrickLink numbers are the part IDs shown and stored (decision 18 Nov 2026, confirmed 19 Nov).
import { beforeAll, describe, expect, it } from 'vitest';
import { blFor, rbFor, upgradeCatalogKey } from '../../src/domain/partNumbers';
import { buildLibrary, libraryTemplate, searchLibrary, shownPartNo, type PartsLibrary } from '../../src/domain/partsLibrary';
import { partByKey } from '../../src/domain/catalog';
import { createProject } from '../../src/domain/project';
import { addObject } from '../../src/domain/objects';
import { migrateProject } from '../../src/domain/migrations';
import { emptyInventory, inventoryCsv, parseInventory, partsNeeded, readBrickwithCsv, readInventoryCsv } from '../../src/domain/inventory';
import { toLibraryPart } from '../../src/cloud/rebrickable';
import { lego } from '../../src/domain/legoColors';
import catalog from '../../src/data/parts-catalog.json';

let lib: PartsLibrary;
beforeAll(() => {
  lib = buildLibrary(catalog as unknown as Parameters<typeof buildLibrary>[0]);
});

describe('BrickLink part numbers', () => {
  it('knows where Rebrickable and BrickLink number a part differently', () => {
    expect(blFor('6141')).toBe('4073');
    expect(blFor('3070b')).toBe('3070');
    expect(blFor('3020')).toBe('3020');
    // And back, for files meant for rebrickable.com.
    const isRb = (no: string) => lib.byNo.has(no);
    expect(rbFor('4073', isRb)).toBe('6141');
    expect(rbFor('3070', isRb)).toBe('3070b');
    expect(rbFor('3020', isRb)).toBe('3020');
    // BrickLink's 3001 is also another Rebrickable part's number; Rebrickable's own 3001 wins.
    expect(rbFor('3001', isRb)).toBe('3001');
  });

  it('the parts list shows, finds and places parts by their BrickLink number', () => {
    const tile = lib.byNo.get('3068b')!;
    expect(shownPartNo(tile)).toBe('3068');
    expect(lib.byBl.get('3068')).toBe(tile);
    expect(lib.byBl.get('3001')!.partNo).toBe('3001');
    expect(searchLibrary(lib, '4073').parts[0]!.partNo).toBe('6141');
    expect(libraryTemplate(lib.byNo.get('6141')!).catalogKey).toBe('bl:4073');
    // Built-in starter parts show BrickLink's number too.
    expect(partByKey('tile-1x1')).toMatchObject({ partNo: '3070', rbNo: '3070b' });
    expect(partByKey('round-1x1')).toMatchObject({ partNo: '4073', rbNo: '6141' });
  });

  it('a part looked up live is stored under the BrickLink number Rebrickable gives', () => {
    const p = toLibraryPart({ part_num: '6141', name: 'Plate Round 1 x 1', part_cat_id: 21, external_ids: { BrickLink: ['4073'] } });
    expect(libraryTemplate(p).catalogKey).toBe('bl:4073');
    // No BrickLink number: Rebrickable's is used.
    expect(libraryTemplate(toLibraryPart({ part_num: '99999', name: 'Odd', part_cat_id: 999 })).catalogKey).toBe('bl:99999');
  });

  it('older projects are upgraded: pieces stored with Rebrickable numbers get BrickLink ones', () => {
    let p = createProject({ name: 'Old', table: { widthIn: 20, depthIn: 20 } });
    const levelId = p.levels[0]!.id;
    const add = (catalogKey: string, x: number) => (p = addObject(p, { levelId, type: 'piece', name: 'Part', width: 1, depth: 1, color: lego('Tan'), catalogKey, center: { x, y: 2 } }, 'full').project);
    add('rb:6141', 1);
    add('rb:3020', 3);
    add('tile-1x1', 5);
    add('shape:abc', 7);
    const old = { ...p, schemaVersion: 1 };
    const up = migrateProject(old);
    expect(up.schemaVersion).toBe(2);
    expect(up.objects.map((o) => o.catalogKey)).toEqual(['bl:4073', 'bl:3020', 'tile-1x1', 'shape:abc']);
    expect(up.objects.map((o) => o.id)).toEqual(p.objects.map((o) => o.id));
    expect(partsNeeded(up).parts.map((r) => r.partNo).sort()).toEqual(['3020', '3070', '4073']);
    expect(upgradeCatalogKey('bl:4073')).toBe('bl:4073');
  });

  it('an older parts book (Rebrickable numbers) is converted once; quantities merge', () => {
    const old = {
      have: { '6141|Tan': 10, '3070b|Black': 4, '3020|Red': 2 },
      brickwith: { '6141|Tan': {} },
      prices: { 'bricklink|6141|Tan': 0.03, 'brickwith|3070b|Black': 0.05 },
      usualPrice: {},
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const inv = parseInventory(old)!;
    expect(inv).toMatchObject({
      numbers: 'bricklink',
      have: { '4073|Tan': 10, '3070|Black': 4, '3020|Red': 2 },
      brickwith: { '4073|Tan': {} },
      prices: { 'bricklink|4073|Tan': 0.03, 'brickwith|3070|Black': 0.05 },
      updatedAt: old.updatedAt,
    });
    // Already converted: left alone (3070 is not turned into anything else).
    expect(parseInventory(inv)).toEqual(inv);
    expect(parseInventory({ nonsense: true })).toBeNull();
    expect(emptyInventory().numbers).toBe('bricklink');
  });

  it('CSV files: Rebrickable-numbered files are converted; BrickLink-numbered ones are kept', () => {
    const rb = readInventoryCsv(`Part,Color,Quantity\n6141,${lib.colorIds.get('Tan')},20\n3070b,${lib.colorIds.get('Black')},5\n`, lib.colorNames);
    expect([...rb.rows]).toEqual([
      ['4073|Tan', 20],
      ['3070|Black', 5],
    ]);
    const bl = readInventoryCsv('BrickLink part,Colour,Quantity\n4073,Tan,7\n', lib.colorNames);
    expect([...bl.rows]).toEqual([['4073|Tan', 7]]);
    // Our own export says which numbers it uses, so it reads back the same.
    const csv = inventoryCsv({ ...emptyInventory(), have: { '4073|Tan': 3 } });
    expect(csv.split('\n')[0]).toBe('BrickLink part,Colour,Quantity');
    expect([...readInventoryCsv(csv, lib.colorNames).rows]).toEqual([['4073|Tan', 3]]);
    const bw = readBrickwithCsv('Part,Colour\n6141,Tan\n', lib.colorNames).apply(emptyInventory());
    expect(bw.brickwith).toEqual({ '4073|Tan': {} });
  });
});
