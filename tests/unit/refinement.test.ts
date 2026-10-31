import { describe, expect, it } from 'vitest';
import { starterProjects } from '../../src/starters';
import {
  addDimension,
  addLayer,
  allItems,
  canDeleteLayer,
  deleteDimension,
  deleteLayer,
  dimensionLength,
  moveItems,
  moveToLayer,
  updateLayer,
} from '../../src/domain/edits';
import { acknowledge } from '../../src/domain/objects';
import { checkLayout } from '../../src/domain/validation';
import { makeDragChecker } from '../../src/editor/dragCheck';
import { overheadSvg } from '../../src/ui/overheadSvg';
import { HELP_CONTEXT, HELP_TOPICS, findTopics } from '../../src/help/topics';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';

const park = () => starterProjects()[0]!.project;

describe('layers', () => {
  it('add, rename, hide/lock, move items and delete only when empty', () => {
    const p = park();
    const { project: q, id } = addLayer(p, 'Setup markers');
    expect(q.layers.at(-1)).toMatchObject({ id, name: 'Setup markers', visible: true, locked: false });
    const c05 = q.modules.find((m) => m.label === 'C-05')!;
    const r = moveToLayer(q, [c05.id], id);
    expect(r.modules.find((m) => m.id === c05.id)!.layerId).toBe(id);
    expect(canDeleteLayer(r, id)).toBe(false);
    expect(deleteLayer(r, id)).toBe(r);
    const locked = updateLayer(r, id, { locked: true, name: 'Locked' });
    expect(locked.layers.find((l) => l.id === id)).toMatchObject({ locked: true, name: 'Locked' });
    expect(deleteLayer(q, id).layers).toHaveLength(p.layers.length);
    // Layers holding something can't be deleted; the empty "Surface details" layer can.
    for (const l of p.layers) expect(canDeleteLayer(p, l.id)).toBe(l.name === 'Surface details');
  });
});

describe('saved dimensions', () => {
  it('add, measure, survive export/import, delete', () => {
    const p = park();
    const { project: q, id } = addDimension(p, { levelId: p.levels[0]!.id, x1: 0, y1: 0, x2: 30, y2: 40, label: 'Aisle' });
    const d = q.dimensions.find((x) => x.id === id)!;
    expect(dimensionLength(d)).toBe(50);
    expect(parseProjectFile(exportProject(q)).dimensions).toEqual(q.dimensions);
    expect(deleteDimension(q, id).dimensions).toEqual([]);
  });
});

describe('drag check matches the full layout check', () => {
  it('flags exactly the moved items that checkLayout would warn about', () => {
    const p = park();
    const level = p.levels[0]!.id;
    const cases: [string[], number, number][] = [
      [['C-05'], 0, 0], // in place: fine
      [['C-05'], 32, 0], // onto C-06
      [['C-05', 'C-06'], 0, 200], // off the table
      [['B-01'], 300, -40], // off the back
      [['C-11'], 340, 40], // into the empty end of the table: fine
    ];
    for (const [labels, dx, dy] of cases) {
      const ids = labels.map((l) => p.modules.find((m) => m.label === l)!.id);
      const fast = makeDragChecker(p, level, new Set(ids))(dx, dy);
      const moved = moveItems(p, ids, dx, dy);
      const slow = new Set(
        checkLayout(moved)
          .filter((w) => w.kind === 'overlap' || w.kind === 'overhang')
          .flatMap((w) => w.ids)
          .filter((id) => ids.includes(id)),
      );
      expect([...fast].sort(), `${labels} by ${dx},${dy}`).toEqual([...slow].sort());
    }
  });

  it('respects warnings marked as intended', () => {
    const p = park();
    const b01 = p.modules.find((m) => m.label === 'B-01')!;
    const moved = moveItems(p, [b01.id], 0, 40);
    const w = checkLayout(moved).find((x) => x.kind === 'overhang')!;
    const q = acknowledge(p, w);
    expect(makeDragChecker(q, p.levels[0]!.id, new Set([b01.id]))(0, 40).size).toBe(0);
  });
});

describe('overhead SVG', () => {
  it('draws every module and ride, escapes text, and includes dimensions when labelled', () => {
    const p = park();
    p.modules.find((m) => m.name === 'Giant Slides')!.name = 'Rides & <Slides>';
    const { project: q } = addDimension(p, { levelId: p.levels[0]!.id, x1: 0, y1: 0, x2: 32, y2: 0, label: 'Gap' });
    const thumb = overheadSvg(q);
    expect(thumb.match(/class="pv-module"/g)).toHaveLength(92 + 16); // plates + ride bases
    expect(thumb).not.toContain('<text');
    const full = overheadSvg(q, { labels: true, standalone: true, pixelsPerStud: 6 });
    expect(full).toContain('Rides &amp; &lt;Slides&gt;');
    expect(full).toContain('<style>');
    expect(full).toMatch(/Gap: 10\.1 in/);
    expect(full).toMatch(/width="\d+" height="\d+"/);
    // Well-formed XML.
    expect(new DOMParser().parseFromString(full, 'image/svg+xml').querySelector('parsererror')).toBeNull();
  });

  it('hidden layers are left out', () => {
    const p = park();
    const items = p.layers.find((l) => l.name.startsWith('Markers'))!;
    expect(overheadSvg(p).match(/pv-item/g)).toHaveLength(1); // the 2x10
    const hidden = updateLayer(p, items.id, { visible: false });
    expect(overheadSvg(hidden).match(/pv-item/g)).toBeNull();
    expect(allItems(hidden).length).toBe(allItems(p).length);
  });
});

describe('help', () => {
  it('every screen opens an existing topic, ids are unique, and search works', () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of Object.values(HELP_CONTEXT)) expect(ids).toContain(id);
    expect(findTopics('checkpoint').map((t) => t.id)).toContain('backups');
    expect(findTopics('pinch zoom').map((t) => t.id)).toContain('ipad');
    expect(findTopics('zzzz')).toEqual([]);
  });

  it('the shortcuts topic lists the keys the editor handles', () => {
    const text = HELP_TOPICS.find((t) => t.id === 'shortcuts')!.body.join(' ');
    for (const key of ['Arrow', 'R / Shift+R', 'Delete', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+A', 'Escape', 'Ctrl+D', 'Ctrl+C', 'Ctrl+G', 'Alt-click', 'V:', 'H:', 'M:', 'F:', '?']) {
      expect(text).toContain(key);
    }
  });
});
