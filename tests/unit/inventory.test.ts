import { describe, expect, it } from 'vitest';
import doc from '../../src/data/parts-catalog.json';
import { buildLibrary, libraryTemplate } from '../../src/domain/partsLibrary';
import { createProject } from '../../src/domain/project';
import { addObject } from '../../src/domain/objects';
import { paintCells } from '../../src/domain/brush';
import { drawStairs } from '../../src/domain/stairs';
import { lego } from '../../src/domain/legoColors';
import { applyImport, emptyInventory, inventoryCsv, partsListCsv, partsNeeded, readInventoryCsv, rebrickableCsv, setHave, shoppingList } from '../../src/domain/inventory';

const lib = buildLibrary(doc as never);

function layout() {
  const p = createProject({ name: 'Parts', table: { widthIn: 30, depthIn: 30 } });
  const level = p.levels[0]!.id;
  const layer = p.layers.find((l) => l.name === 'Surface details')!.id;
  // 12 tan round 1x1 plates (built-in part), 2 grey 2x4 plates (library part), 1 home-made piece, stairs.
  let q = paintCells(p, level, layer, { type: 'piece', name: 'Plate Round 1×1', width: 1, depth: 1, color: lego('Tan'), round: true, catalogKey: 'round-1x1' }, Array.from({ length: 12 }, (_, i) => ({ x: i, y: 0 }))).project;
  const plate = libraryTemplate(lib.byNo.get('3020')!, 'Light Bluish Gray');
  q = paintCells(q, level, layer, plate, [{ x: 0, y: 4 }, { x: 4, y: 4 }]).project;
  q = addObject(q, { levelId: level, type: 'piece', name: 'My odd piece', width: 1, depth: 3, color: lego('Red'), center: { x: 20, y: 20 } }, 'full').project;
  q = drawStairs(q, { levelId: level, layerId: layer, points: [{ x: 2, y: 12 }, { x: 10, y: 12 }], width: 2, stepDepth: 2, risePlates: 1, startPlates: 0, landingEvery: 0, color: lego('Tan'), smooth: true })!.project;
  return q;
}

describe('parts needed, have, to buy', () => {
  it('counts real parts by number and colour; made-up pieces and stairs are set aside', () => {
    const n = partsNeeded(layout());
    expect(n.parts.map((r) => [r.partNo, r.colorName, r.needed])).toEqual([
      ['6141', 'Tan', 12],
      ['3020', 'Light Bluish Gray', 2],
    ]);
    expect(n.unnumbered).toBe(1);
    expect(n.stairs).toBe(4);
  });

  it('to buy is what is needed beyond what you have; Rebrickable CSV uses colour ids', () => {
    let inv = setHave(emptyInventory(), '6141', 'Tan', 5);
    inv = setHave(inv, '3020', 'Light Bluish Gray', 10);
    const rows = shoppingList(partsNeeded(layout()).parts, inv);
    expect(rows.map((r) => [r.partNo, r.have, r.toBuy])).toEqual([
      ['6141', 5, 7],
      ['3020', 10, 0],
    ]);
    const { csv, skipped } = rebrickableCsv(rows, lib.colorIds);
    expect(skipped).toEqual([]);
    expect(csv).toBe(`Part,Color,Quantity\n6141,${lib.colorIds.get('Tan')},7\n`);
    expect(partsListCsv(rows).split('\n')[1]).toBe('6141,Plate Round 1×1,Tan,12,5,7');
  });

  it('imports Rebrickable (colour ids) and our own export (colour names); round trip', () => {
    const rb = readInventoryCsv(`Part,Color,Quantity,Is Spare\n3024,${lib.colorIds.get('White')},20,False\n3024,${lib.colorIds.get('White')},4,True\n3001,9999999,1,False\n`, lib.colorNames);
    expect(rb.rows.get('3024|White')).toBe(24);
    expect(rb.problems).toHaveLength(1);
    let inv = applyImport(emptyInventory(), rb);
    inv = setHave(inv, '6141', 'Tan', 300);
    const back = readInventoryCsv(inventoryCsv(inv), lib.colorNames);
    expect(applyImport(emptyInventory(), back).have).toEqual(inv.have);
    expect(readInventoryCsv('a,b\n1,2', lib.colorNames).problems[0]).toMatch(/Part, Colour/);
  });
});
