// Shaped features (19 Nov 2026): buildings and bases that aren't rectangles.
import { describe, expect, it } from 'vitest';
import { cleanOutline, insideOutline, labelSpot, outlineArea, outlineOnTable, shapesClash } from '../../src/domain/outline';
import { addModule, addShapedFeature, insertCopies, resizeModule, rotateItems } from '../../src/domain/edits';
import { itemAt } from '../../src/domain/hit';
import { createProject } from '../../src/domain/project';
import { checkLayout as validateLayout } from '../../src/domain/validation';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { overheadSvg } from '../../src/ui/overheadSvg';

// An L: 32 across the top, 16 down the left, 16×16 notch out of the lower right.
const L = [
  { x: 10, y: 10 },
  { x: 42, y: 10 },
  { x: 42, y: 26 },
  { x: 26, y: 26 },
  { x: 26, y: 42 },
  { x: 10, y: 42 },
];

function park() {
  const p = createProject({ name: 'Town', table: { widthIn: 40, depthIn: 30 } });
  return { p, levelId: p.levels[0]!.id };
}

describe('drawing a shape', () => {
  it('tidies the corners clicked: snapped, no repeats, no closing click, no mid-wall corners', () => {
    expect(cleanOutline([{ x: 0.2, y: 0 }, { x: 8, y: 0.1 }, { x: 16, y: 0 }, { x: 16, y: 16 }, { x: 16, y: 16 }, { x: 0, y: 16 }, { x: 0, y: 0 }], 'full')).toEqual([
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 16 },
      { x: 0, y: 16 },
    ]);
    expect(cleanOutline([{ x: 0, y: 0 }, { x: 5, y: 0 }], 'full')).toBeNull();
    expect(cleanOutline([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], 'full')).toBeNull(); // a straight line
  });

  it('makes one named feature (a base with no plate ID) with its outline kept relative to its box', () => {
    const { p, levelId } = park();
    const r = addShapedFeature(p, { levelId, name: 'Town hall', color: '#c05046', points: L }, 'full')!;
    const m = r.project.modules.find((x) => x.id === r.id)!;
    expect(m).toMatchObject({ name: 'Town hall', label: '', x: 10, y: 10, width: 32, depth: 32, rotation: 0, color: '#c05046' });
    expect(m.outline).toEqual([{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 16 }, { x: 16, y: 16 }, { x: 16, y: 32 }, { x: 0, y: 32 }]);
    expect(outlineArea(m)).toBe(32 * 32 - 16 * 16);
    // Clicking the four corners of a rectangle just makes a rectangle.
    const box = addShapedFeature(p, { levelId, name: 'Shed', color: '#c05046', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 0, y: 4 }] }, 'full')!;
    expect(box.project.modules.find((x) => x.id === box.id)!.outline).toBeUndefined();
    expect(addShapedFeature(p, { levelId, name: 'x', color: '#c05046', points: L.slice(0, 2) }, 'full')).toBeNull();
  });
});

describe('a shaped feature on the table', () => {
  it('is picked by clicking inside the shape, not in its empty corner', () => {
    const { p, levelId } = park();
    const r = addShapedFeature(p, { levelId, name: 'Town hall', color: '#c05046', points: L }, 'full')!;
    expect(itemAt(r.project, levelId, 15, 15)?.id).toBe(r.id);
    expect(itemAt(r.project, levelId, 35, 35)).toBeNull(); // the notch
  });

  it('turns with the selection, stretches with Width/Depth, and copies with its shape', () => {
    const { p, levelId } = park();
    const r = addShapedFeature(p, { levelId, name: 'Town hall', color: '#c05046', points: L }, 'full')!;
    // Turned 90° clockwise, the notch moves from lower right to lower left.
    const turned = rotateItems(r.project, [r.id], 1, 'full');
    const m = turned.modules.find((x) => x.id === r.id)!;
    const pts = outlineOnTable(m)!;
    expect(insideOutline(pts, m.x + 8, m.y + 24)).toBe(false);
    expect(insideOutline(pts, m.x + 24, m.y + 24)).toBe(true);
    expect(insideOutline(pts, m.x + 8, m.y + 8)).toBe(true);
    // Stretched to 64 wide: the notch is 32 wide too.
    const wide = resizeModule(r.project, r.id, 'custom', 64, 32, 'full').modules.find((x) => x.id === r.id)!;
    expect(wide.outline![2]).toEqual({ x: 64, y: 16 });
    expect(wide.outline![3]).toEqual({ x: 32, y: 16 });
    const copy = insertCopies(r.project, [r.project.modules.find((x) => x.id === r.id)!], levelId, 40, 0);
    expect(copy.project.modules.find((x) => x.id === copy.ids[0])!.outline).toEqual(r.project.modules.find((x) => x.id === r.id)!.outline);
  });

  it('a building in the notch of an L doesn’t overlap it; one across its wall does', () => {
    const { p, levelId } = park();
    const r = addShapedFeature(p, { levelId, name: 'Town hall', color: '#c05046', points: L }, 'full')!;
    const inNotch = addModule(r.project, { levelId, kind: '16x16', name: 'Kiosk', center: { x: 34, y: 34 }, exact: true }, 'full');
    expect(validateLayout(inNotch.project).filter((w) => w.kind === 'overlap')).toEqual([]);
    const across = addModule(r.project, { levelId, kind: '16x16', name: 'Kiosk', center: { x: 30, y: 30 }, exact: true }, 'full');
    expect(validateLayout(across.project).filter((w) => w.kind === 'overlap')).toHaveLength(1);
    // A small base built entirely on the L is fine (it sits on it).
    expect(shapesClash({ x: 12, y: 12, width: 4, depth: 4, pts: null }, { ...{ x: 10, y: 10, width: 32, depth: 32 }, pts: L }, true, true)).toBe(false);
  });

  it('is drawn with its outline and its name inside it (pictures, print, previews)', () => {
    const { p, levelId } = park();
    const r = addShapedFeature(p, { levelId, name: 'Town hall', color: '#c05046', points: L }, 'full')!;
    const svg = overheadSvg(r.project, { labels: true });
    expect(svg).toContain('<polygon class="pv-module" data-label="" points="10,10 42,10 42,26 26,26 26,42 10,42" fill="#c05046"/>');
    expect(svg).toContain('>Town hall</text>');
    const spot = labelSpot(L);
    expect(insideOutline(L, spot.x, spot.y)).toBe(true);
  });

  it('survives saving and opening the project file', () => {
    const { p, levelId } = park();
    const r = addShapedFeature(p, { levelId, name: 'Town hall', color: '#c05046', points: L }, 'full')!;
    const back = parseProjectFile(exportProject(r.project));
    expect(back.modules.find((x) => x.id === r.id)!.outline).toHaveLength(6);
  });
});
