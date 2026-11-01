import { newId, nowIso } from './ids';
import { inchesToStuds } from './units';
import { SCHEMA_VERSION, isBase, type Features, type Project, type Settings } from './schema';

export const DEFAULT_SETTINGS: Settings = { displayUnit: 'in', snap: 'full', showGrid: true, showLabels: true, moduleColors: 'size', heightShading: false, brickwithFirst: false };

export const DEFAULT_FEATURES: Features = {
  heights: false,
  inventory: false,
  versions: false,
  exhibitions: false,
  transport: false,
  helpers: false,
  builds: false,
};

/** Standard table elevation used when nothing else is known. */
export const DEFAULT_TABLE_HEIGHT_IN = 30;

export interface NewProjectOptions {
  name: string;
  description?: string;
  /** Table top size in inches. Omit for a project with no table yet. */
  table?: { widthIn: number; depthIn: number; name?: string };
}

/** A new project starts with one level, one layer and (optionally) one table. */
export function createProject(opts: NewProjectOptions): Project {
  const now = nowIso();
  const levelId = newId();
  const layerId = newId();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name: opts.name.trim(),
    description: opts.description ?? '',
    createdAt: now,
    updatedAt: now,
    revision: 0,
    revisionId: newId(),
    archived: false,
    settings: { ...DEFAULT_SETTINGS },
    features: { ...DEFAULT_FEATURES },
    levels: [{ id: levelId, name: 'Main table', elevationIn: DEFAULT_TABLE_HEIGHT_IN, offsetX: 0, offsetY: 0, visible: true, order: 0 }],
    // Bottom to top: plates, then what's built on them, then setup markers.
    layers: [
      { id: layerId, name: 'Table, modules & bases', visible: true, locked: false, order: 0 },
      { id: newId(), name: 'Surface details', visible: true, locked: false, order: 1 },
      { id: newId(), name: 'Markers & small items', visible: true, locked: false, order: 2 },
    ],
    tables: opts.table
      ? [
          {
            id: newId(),
            levelId,
            layerId,
            name: opts.table.name ?? 'Table',
            x: 0,
            y: 0,
            width: inchesToStuds(opts.table.widthIn),
            depth: inchesToStuds(opts.table.depthIn),
            rotation: 0,
            notes: '',
          },
        ]
      : [],
    modules: [],
    objects: [],
    groups: [],
    retiredLabels: [],
    storedLabels: [],
    shapes: [],
    acknowledgements: [],
    dimensions: [],
    designs: [],
    curves: [],
    stairs: [],
    spending: [],
    builds: [],
    containers: [],
    shows: [],
  };
}

/**
 * Copy a project under a new project ID. Module/object IDs are kept: a duplicate
 * describes the same physical MILS plates (e.g. an alternative arrangement).
 */
export function duplicateProject(source: Project, name?: string): Project {
  const now = nowIso();
  const copy: Project = structuredClone(source);
  copy.id = newId();
  copy.name = (name ?? `${source.name} (copy)`).trim();
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.revision = 0;
  copy.revisionId = newId();
  copy.archived = false;
  return copy;
}

export function projectStats(p: Project) {
  const byKind: Record<string, number> = {};
  for (const m of p.modules) if (!isBase(m)) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
  return {
    levels: p.levels.length,
    tables: p.tables.length,
    /** MILS plates (bases are counted separately). */
    modules: p.modules.filter((m) => !isBase(m)).length,
    modulesByKind: byKind,
    /** Features (rides, buildings…): named bases plus any older footprint objects. */
    footprints: p.modules.filter(isBase).length + p.objects.filter((o) => o.type === 'footprint').length,
    markers: p.objects.filter((o) => o.type === 'setupMarker').length,
    items: p.objects.filter((o) => o.type === 'item' || o.type === 'piece').length,
  };
}
