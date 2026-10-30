// Large-exhibition fixture: a 42 × 42 in display surface packed with 16×16 modules
// and thousands of small items, for performance checks.
import { createProject } from '../../src/domain/project';
import { newId } from '../../src/domain/ids';
import type { CanvasObject, MilsModule, Project } from '../../src/domain/schema';

export function largeProject(opts: { tablesAcross?: number; itemsPerModule?: number } = {}): Project {
  const across = opts.tablesAcross ?? 4; // 4 × 42 in = 14 ft of display
  const perModule = opts.itemsPerModule ?? 6;
  const p = createProject({ name: 'Large exhibition fixture', table: { widthIn: 42 * across, depthIn: 42 } });
  const levelId = p.levels[0]!.id;
  const layerId = p.layers[0]!.id;
  const cols = Math.floor((42 * across * 3.175) / 16);
  const rows = Math.floor((42 * 3.175) / 16);
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      n++;
      const m: MilsModule = {
        id: newId(), levelId, layerId, kind: '16x16', label: `B-${String(n).padStart(3, '0')}`, name: '',
        x: c * 16, y: r * 16, width: 16, depth: 16, rotation: 0, notes: '',
      };
      p.modules.push(m);
      for (let i = 0; i < perModule; i++) {
        const o: CanvasObject = {
          id: newId(), levelId, layerId, type: 'setupMarker', name: 'Lamp', color: '#f4f4f4', markerKind: 'lamp',
          x: m.x + 1 + (i % 3) * 5, y: m.y + 1 + Math.floor(i / 3) * 5, width: 2, depth: 2, rotation: 0, notes: '',
        };
        p.objects.push(o);
      }
    }
  }
  return p;
}
