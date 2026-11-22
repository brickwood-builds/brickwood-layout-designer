// Small items can show their name on the layout (22 Nov 2026): "Game building" visible on the overview.
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/domain/project';
import { addObject, addShape, saveShape, setShowName } from '../../src/domain/objects';
import { lego } from '../../src/domain/legoColors';
import { overheadSvg } from '../../src/ui/overheadSvg';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';

function setup() {
  const p = createProject({ name: 'Park', table: { widthIn: 40, depthIn: 30 } });
  return { p, levelId: p.levels[0]!.id };
}
const item = { type: 'item' as const, name: 'Game building', width: 8, depth: 6, color: lego('Red') };

describe('showing a small item’s name on the layout', () => {
  it('is off unless asked for; a new item can start with it on', () => {
    const { p, levelId } = setup();
    const a = addObject(p, { ...item, levelId, center: { x: 10, y: 10 } }, 'full');
    expect(a.project.objects[0]!.showName).toBeUndefined();
    const b = addObject(p, { ...item, levelId, center: { x: 10, y: 10 }, showName: true }, 'full');
    expect(b.project.objects[0]!.showName).toBe(true);
  });

  it('turning it on for one placed from the palette turns it on for all of that kind, and new ones', () => {
    const { p, levelId } = setup();
    let q = addShape(p, { ...item }).project;
    const shapeId = q.shapes[0]!.id;
    const ids: string[] = [];
    for (const x of [10, 30, 50]) {
      const r = addObject(q, { ...item, levelId, center: { x, y: 10 }, catalogKey: `shape:${shapeId}` }, 'full');
      q = r.project;
      ids.push(r.id);
    }
    const bench = addObject(q, { type: 'item', name: 'Bench', width: 2, depth: 1, color: lego('Reddish Brown'), levelId, center: { x: 5, y: 20 } }, 'full');
    q = setShowName(bench.project, ids[1]!, true);
    expect(q.objects.filter((o) => o.name === 'Game building').every((o) => o.showName)).toBe(true);
    expect(q.objects.find((o) => o.name === 'Bench')!.showName).toBeUndefined();
    expect(q.shapes[0]!.showName).toBe(true);
    q = setShowName(q, ids[0]!, false);
    expect(q.objects.some((o) => o.showName)).toBe(false);
    expect(q.shapes[0]!.showName).toBeUndefined();
  });

  it('“Add to palette” makes a made-up item one of its kind; a real LEGO part keeps its number', () => {
    const { p, levelId } = setup();
    const a = addObject(p, { ...item, levelId, center: { x: 10, y: 10 }, showName: true }, 'full');
    const r = saveShape(a.project, a.project.objects[0]!, 'Game building');
    expect(r.project.objects[0]!.catalogKey).toBe(`shape:${r.id}`);
    expect(r.project.shapes[0]!.showName).toBe(true);
    const part = addObject(p, { type: 'piece', name: 'Plate 2×4', width: 4, depth: 2, color: lego('Red'), catalogKey: 'bl:3020', levelId, center: { x: 5, y: 5 } }, 'full');
    expect(saveShape(part.project, part.project.objects[0]!, 'Plate').project.objects[0]!.catalogKey).toBe('bl:3020');
  });

  it('shows on the whole-layout picture (print, previews) and is kept in the project file', () => {
    const { p, levelId } = setup();
    const a = addObject(p, { ...item, levelId, center: { x: 20, y: 20 }, showName: true }, 'full');
    const b = addObject(a.project, { type: 'item', name: 'Bench', width: 2, depth: 1, color: lego('Reddish Brown'), levelId, center: { x: 40, y: 20 } }, 'full');
    const svg = overheadSvg(b.project, { labels: true });
    expect(svg).toContain('>Game building</text>');
    expect(svg).not.toContain('>Bench</text>');
    expect(overheadSvg(b.project, { labels: false })).not.toContain('>Game building</text>');
    expect(parseProjectFile(exportProject(b.project)).objects.find((o) => o.name === 'Game building')!.showName).toBe(true);
  });
});
