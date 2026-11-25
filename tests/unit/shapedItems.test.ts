// Small items drawn corner by corner (25 Nov 2026).
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addObject, addShapedItem, resizeObject } from '../../src/domain/objects';
import { itemAt } from '../../src/domain/hit';
import { overheadSvg } from '../../src/ui/overheadSvg';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { lego } from '../../src/domain/legoColors';

// An L-shaped bench: 6 across, 2 deep, with a 2 × 2 return down the left.
const L = [{ x: 10, y: 10 }, { x: 16, y: 10 }, { x: 16, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 14 }, { x: 10, y: 14 }];

function setup() {
  const p = createProject({ name: 'Park', table: { widthIn: 30, depthIn: 20 } });
  const levelId = p.levels[0]!.id;
  const layerId = p.layers.find((l) => l.name === 'Markers & small items')!.id;
  return { p, levelId, layerId };
}

describe('a small item drawn corner by corner', () => {
  it('goes in the palette as its own kind, and one is put where it was drawn', () => {
    const { p, levelId, layerId } = setup();
    const r = addShapedItem(p, { levelId, layerId, name: 'Corner bench', color: lego('Reddish Brown'), points: L }, 'full')!;
    const o = r.project.objects.find((x) => x.id === r.id)!;
    expect(o).toMatchObject({ type: 'item', name: 'Corner bench', x: 10, y: 10, width: 6, depth: 4, layerId, catalogKey: `shape:${r.shapeId}` });
    expect(o.outline).toHaveLength(6);
    expect(r.project.shapes.find((s) => s.id === r.shapeId)).toMatchObject({ type: 'item', name: 'Corner bench', width: 6, depth: 4 });
    expect(r.project.shapes[0]!.outline).toEqual(o.outline);
    // Four corners of a plain box: just a box.
    const box = addShapedItem(p, { levelId, layerId, name: 'Box', color: lego('Red'), points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }] }, 'full')!;
    expect(box.project.objects[0]!.outline).toBeUndefined();
  });

  it('placing another from the palette keeps the shape; clicks follow it; Width stretches it', () => {
    const { p, levelId, layerId } = setup();
    const r = addShapedItem(p, { levelId, layerId, name: 'Corner bench', color: lego('Reddish Brown'), points: L }, 'full')!;
    const shape = r.project.shapes[0]!;
    const copy = addObject(r.project, { levelId, layerId, type: 'item', name: shape.name, width: shape.width, depth: shape.depth, color: shape.color, outline: shape.outline, catalogKey: `shape:${shape.id}`, center: { x: 33, y: 22 } }, 'full');
    const c = copy.project.objects.find((x) => x.id === copy.id)!;
    expect(c.outline).toEqual(shape.outline);
    // In the bench: picked. In its empty corner: not.
    expect(itemAt(copy.project, levelId, c.x + 1, c.y + 1)?.id).toBe(copy.id);
    expect(itemAt(copy.project, levelId, c.x + 5, c.y + 3)?.id).not.toBe(copy.id);
    const wide = resizeObject(copy.project, copy.id, 12, 4, 'full').objects.find((x) => x.id === copy.id)!;
    expect(Math.max(...wide.outline!.map((q) => q.x))).toBe(12);
  });

  it('drawn with its shape on pictures, and kept in the project file', () => {
    const { p, levelId, layerId } = setup();
    const r = addShapedItem(p, { levelId, layerId, name: 'Corner bench', color: lego('Reddish Brown'), points: L }, 'full')!;
    expect(overheadSvg(r.project)).toContain('<polygon class="pv-item"');
    const back = parseProjectFile(exportProject(r.project));
    expect(back.objects[0]!.outline).toHaveLength(6);
    expect(back.shapes[0]!.outline).toHaveLength(6);
  });
});
