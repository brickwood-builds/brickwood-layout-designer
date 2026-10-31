// Owner feedback round 1 (31 Oct 2026): LEGO colours, 8×16, layers stacking, own markers/items,
// finished look.
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addModule, moveItems, moveLayer } from '../../src/domain/edits';
import { addObject, addShape, defaultItemLayerId, withCarriedItems } from '../../src/domain/objects';
import { checkLayout } from '../../src/domain/validation';
import { makeDragChecker } from '../../src/editor/dragCheck';
import { LEGO_COLORS, legoColorName, lego } from '../../src/domain/legoColors';
import { MARKER_KINDS } from '../../src/domain/markers';
import { STARTER_PARTS } from '../../src/domain/catalog';
import { overheadSvg } from '../../src/ui/overheadSvg';
import { starterProjects } from '../../src/starters';
import { ProjectSchema } from '../../src/domain/schema';

const base = () => {
  const p = createProject({ name: 'Feedback', table: { widthIn: 40, depthIn: 30 } });
  const level = p.levels[0]!.id;
  const { project, id } = addModule(p, { levelId: level, kind: '32x32', center: { x: 16, y: 16 }, exact: true }, 'full');
  return { p: project, level, moduleId: id };
};
const layer = (p: ReturnType<typeof base>['p'], name: string) => p.layers.find((l) => l.name === name)!.id;

describe('LEGO colours', () => {
  it('every marker and starter part uses a real LEGO colour; names are unique', () => {
    for (const c of [...MARKER_KINDS.map((m) => m.color), ...STARTER_PARTS.map((s) => s.color)]) expect(legoColorName(c)).toBeTruthy();
    expect(new Set(LEGO_COLORS.map((c) => c.name)).size).toBe(LEGO_COLORS.length);
    expect(new Set(LEGO_COLORS.map((c) => c.hex)).size).toBe(LEGO_COLORS.length);
    expect(() => lego('Gradient Purple')).toThrow();
  });
});

describe('8×16 module', () => {
  it('is a 16×8 plate standing upright, with an A-xx ID', () => {
    const p = createProject({ name: 'x', table: { widthIn: 40, depthIn: 30 } });
    const { project, id } = addModule(p, { levelId: p.levels[0]!.id, kind: '16x8', width: 8, depth: 16, center: { x: 20, y: 20 } }, 'full');
    expect(project.modules.find((m) => m.id === id)).toMatchObject({ kind: '16x8', width: 8, depth: 16, label: 'A-01' });
  });
});

describe('layers stack', () => {
  it('new projects have plates, surface details and markers layers, bottom to top', () => {
    const p = createProject({ name: 'x' });
    expect([...p.layers].sort((a, b) => a.order - b.order).map((l) => l.name)).toEqual(['Table, modules & bases', 'Surface details', 'Markers & small items']);
    expect(defaultItemLayerId(p)).toBe(layer(p, 'Markers & small items'));
  });

  it('a sidewalk (surface layer) and a lamp on it (marker layer) are fine; two lamps in one spot warn', () => {
    const { p, level } = base();
    const sidewalk = addObject(p, { levelId: level, type: 'item', name: 'Sidewalk', width: 32, depth: 4, color: lego('Light Bluish Gray'), center: { x: 16, y: 2 }, layerId: layer(p, 'Surface details') }, 'full');
    const lamp = addObject(sidewalk.project, { levelId: level, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x: 5, y: 2 } }, 'full');
    expect(checkLayout(lamp.project)).toEqual([]);
    const lamp2 = addObject(lamp.project, { levelId: level, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x: 5, y: 2 } }, 'full');
    expect(checkLayout(lamp2.project).map((w) => w.kind)).toEqual(['overlap']);
    // The quick drag check follows the same rule.
    const check = makeDragChecker(lamp.project, level, new Set([lamp.id]));
    expect(check(10, 0).size).toBe(0);
  });

  it('details built on a plate move with it', () => {
    const { p, level, moduleId } = base();
    const sidewalk = addObject(p, { levelId: level, type: 'item', name: 'Sidewalk', width: 16, depth: 4, color: lego('Light Bluish Gray'), center: { x: 16, y: 10 }, layerId: layer(p, 'Surface details') }, 'full');
    expect(withCarriedItems(sidewalk.project, [moduleId]).sort()).toEqual([moduleId, sidewalk.id].sort());
    const moved = moveItems(sidewalk.project, withCarriedItems(sidewalk.project, [moduleId]), 40, 0);
    expect(moved.objects[0]!.x).toBe(sidewalk.project.objects[0]!.x + 40);
  });

  it('▲▼ reorders layers, and drawing follows layer order', () => {
    const { p, level } = base();
    const sidewalk = addObject(p, { levelId: level, type: 'item', name: 'Sidewalk', width: 4, depth: 4, color: lego('Light Bluish Gray'), center: { x: 5, y: 5 }, layerId: layer(p, 'Surface details') }, 'full');
    const lamp = addObject(sidewalk.project, { levelId: level, type: 'setupMarker', name: 'Lamp', width: 2, depth: 2, color: lego('White'), center: { x: 5, y: 5 } }, 'full');
    const svgOrder = (proj: typeof p) => {
      const svg = overheadSvg(proj);
      return svg.indexOf(lego('Light Bluish Gray')) < svg.indexOf(`fill="${lego('White')}"`) ? 'sidewalk below lamp' : 'lamp below sidewalk';
    };
    expect(svgOrder(lamp.project)).toBe('sidewalk below lamp');
    const swapped = moveLayer(lamp.project, layer(p, 'Surface details'), 1);
    expect(svgOrder(swapped)).toBe('lamp below sidewalk');
    expect(moveLayer(swapped, layer(p, 'Surface details'), 1)).toBe(swapped); // already on top
  });
});

describe('own markers and items', () => {
  it('saved shapes keep their type so they appear in the right palette section', () => {
    const p = createProject({ name: 'x' });
    const r = addShape(p, { name: 'Popcorn cart', type: 'setupMarker', width: 2, depth: 2, color: lego('Yellow') });
    expect(r.project.shapes[0]).toEqual({ id: r.id, name: 'Popcorn cart', type: 'setupMarker', width: 2, depth: 2, color: lego('Yellow') });
    expect(ProjectSchema.parse(r.project).shapes).toHaveLength(1);
  });
});

describe('finished look', () => {
  it('plates use their real colour (green when not set); IDs can be hidden', () => {
    const park = starterProjects()[0]!.project;
    const c05 = park.modules.find((m) => m.label === 'C-05')!;
    c05.plateColor = lego('Dark Bluish Gray');
    const finished = { ...park, settings: { ...park.settings, moduleColors: 'plate' as const } };
    const svg = overheadSvg(finished);
    expect(svg).toContain(`data-label="C-05" x="${c05.x}" y="${c05.y}" width="32" height="32" fill="${lego('Dark Bluish Gray')}"`);
    expect(svg).toContain(`fill="${lego('Green')}"`);
    expect(svg).toContain('fill="#c05046"'); // ride bases keep their colour
    expect(overheadSvg(park)).not.toContain(`fill="${lego('Dark Bluish Gray')}"`);
  });
});

describe('what is under the pointer', () => {
  it('picks the topmost thing by layer, skips locked/hidden layers, and respects round shapes', async () => {
    const { itemAt } = await import('../../src/domain/hit');
    const { updateLayer } = await import('../../src/domain/edits');
    const { p, level, moduleId } = base();
    const sidewalk = addObject(p, { levelId: level, type: 'item', name: 'Sidewalk', width: 8, depth: 8, color: lego('Light Bluish Gray'), center: { x: 8, y: 8 }, layerId: layer(p, 'Surface details') }, 'full');
    const bush = addObject(sidewalk.project, { levelId: level, type: 'setupMarker', name: 'Bush', width: 2, depth: 2, color: lego('Bright Green'), round: true, center: { x: 8, y: 8 } }, 'full');
    const q = bush.project;
    expect(itemAt(q, level, 8, 8)!.id).toBe(bush.id); // markers on top
    expect(itemAt(q, level, 7.05, 7.05)!.id).toBe(sidewalk.id); // corner outside the round bush
    expect(itemAt(q, level, 20, 20)!.id).toBe(moduleId);
    expect(itemAt(q, level, 100, 100)).toBeNull();
    const locked = updateLayer(q, layer(q, 'Markers & small items'), { locked: true });
    expect(itemAt(locked, level, 8, 8)!.id).toBe(sidewalk.id);
    const hidden = updateLayer(locked, layer(q, 'Surface details'), { visible: false });
    expect(itemAt(hidden, level, 8, 8)!.id).toBe(moduleId);
  });
});
