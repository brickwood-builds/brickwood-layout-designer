// Advisory layout checks. Warnings never modify or delete anything.
import { footprint, rectContains, type Placed } from './geometry';
import { moduleDisplayName, type Project } from './schema';
import { SpatialIndex } from './spatial';

export type WarningKind = 'overhang' | 'overlap' | 'duplicateLabel' | 'retiredLabel';

export interface LayoutWarning {
  kind: WarningKind;
  levelId: string;
  /** IDs of the objects involved. */
  ids: string[];
  message: string;
}

/**
 * Advisory layout checks, applied per level (FR-01.04, FR-02.04).
 * Warnings never modify or delete anything.
 */
export function checkLayout(project: Project): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const labelCounts = new Map<string, string[]>();
  for (const m of project.modules) {
    const key = m.label.trim().toUpperCase();
    if (!key) continue;
    labelCounts.set(key, [...(labelCounts.get(key) ?? []), m.id]);
  }
  for (const [label, ids] of labelCounts) {
    if (ids.length > 1) {
      const levelId = project.modules.find((m) => m.id === ids[0])!.levelId;
      warnings.push({ kind: 'duplicateLabel', levelId, ids, message: `MILS ID ${label} is used ${ids.length} times` });
    }
  }
  const retired = new Set(project.retiredLabels.map((l) => l.trim().toUpperCase()));
  for (const m of project.modules) {
    if (m.label.trim() && retired.has(m.label.trim().toUpperCase())) {
      warnings.push({ kind: 'retiredLabel', levelId: m.levelId, ids: [m.id], message: `MILS ID ${m.label} was retired and should not be reused` });
    }
  }

  for (const level of project.levels) {
    const tables = project.tables.filter((t) => t.levelId === level.id);
    const tableRects = tables.map(footprint);
    const surfaceName = tables.map((t) => t.name).join(' + ') || level.name;
    const items = [...project.modules.filter((m) => m.levelId === level.id), ...project.objects.filter((o) => o.levelId === level.id)];

    if (tableRects.length > 0) {
      for (const item of items) {
        const r = footprint(item);
        // Allowed if fully inside any single table (multi-table joins are modelled as one surface).
        if (!tableRects.some((t) => rectContains(t, r))) {
          const label = 'label' in item ? moduleDisplayName(item) : item.name || 'Object';
          warnings.push({ kind: 'overhang', levelId: level.id, ids: [item.id], message: `${label} overhangs ${surfaceName}` });
        }
      }
    }

    // Modules and ride/building footprints each need their own space; small items may sit on top.
    const solid = new Map<string, { id: string; name: string } & Placed>();
    for (const m of project.modules) if (m.levelId === level.id) solid.set(m.id, { ...m, name: moduleDisplayName(m) });
    for (const o of project.objects) if (o.levelId === level.id && o.type === 'footprint') solid.set(o.id, o);
    for (const [a, b] of new SpatialIndex(solid.values()).overlapPairs()) {
      warnings.push({ kind: 'overlap', levelId: level.id, ids: [a, b], message: `${solid.get(a)!.name} overlaps ${solid.get(b)!.name}` });
    }
    // Small items sit on modules, and things on different layers stack (a lamp on a
    // sidewalk); but two things on the same layer in the same spot is a mistake.
    const small = project.objects.filter((o) => o.levelId === level.id && o.type !== 'footprint');
    for (const layerId of new Set(small.map((o) => o.layerId))) {
      const onLayer = new Map(small.filter((o) => o.layerId === layerId).map((o) => [o.id, o]));
      for (const [a, b] of new SpatialIndex(onLayer.values()).overlapPairs()) {
        warnings.push({ kind: 'overlap', levelId: level.id, ids: [a, b], message: `${onLayer.get(a)!.name || 'Item'} overlaps ${onLayer.get(b)!.name || 'item'}` });
      }
    }
  }
  return warnings;
}
