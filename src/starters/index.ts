import csvText from '../../docs/brickwood-visio-layouts.csv?raw';
import { buildStarterProject, parseVisioCsv, type StarterResult, type StarterSpec } from './visioImport';
import { MARKER_KINDS } from '../domain/markers';
import { createProject } from '../domain/project';
import { stableId } from '../domain/stableId';
import type { Project } from '../domain/schema';

/** Fixed creation date so starter projects are identical on every device. */
const STARTER_DATE = '2026-10-30T00:00:00.000Z';

export const STARTER_SPECS: StarterSpec[] = [
  {
    key: 'adventure-park',
    display: 'AdventurePark_12ft_v7',
    name: 'Brickwood Adventure Park',
    description: 'Current 12 ft Adventure Park layout (Visio "Amusement Layout v7 - 12 foot", Redessign page). Build left to right.',
    table: {
      name: 'Two 6 ft tables + 3.5 × 15.5 ft top',
      widthIn: 186,
      depthIn: 42,
      notes: 'Two 6 ft folding tables topped with a 3.5 × 15.5 ft surface (42 × 186 in). The 12 ft layout leaves about 4 ft unused at the right end.',
    },
    align: 'left',
    pageIn: { width: 138, height: 42 },
    previousDisplay: 'AdventurePark_BaseplatesLayout_v5',
    markers: MARKER_KINDS,
    retiredLabels: ['B-24', 'B-25', 'B-26', 'B-27'],
    power: {
      'Loop Coaster': 4.5,
      'Blast Off': 4.5,
      'Twisted Tracks': 7.5,
      Swings: 9,
      'Ferris Wheel': 9,
      Mixer: 7.5,
      'Timber Wolf': 9,
      Carousel: 9,
      'ATVs and Rafts': 4.5,
      'Ski Lift': 4.5,
      'Green Machine': 6,
      'Roller Coaster': 9,
    },
    notes: {
      'ATVs and Rafts': 'ATVs 4.5 V and Rafts 4.5 V (separate rides).',
      'Twisted Tracks': 'Left and right tracks, 7.5 V each.',
      Carousel: 'Big Carousel (9 V).',
    },
  },
  {
    key: 'kingdom',
    display: 'Kingdom_Village',
    name: 'Brickwood Kingdom (Village)',
    description: 'Brickwood Kingdom village layout from Visio.',
    table: {
      name: '6 ft table + 3.5 × 8 ft plywood',
      widthIn: 96,
      depthIn: 42,
      notes: '6 ft folding table topped with 3.5 × 8 ft plywood (42 × 96 in).',
    },
    retiredLabels: [],
    power: {},
    notes: {},
  },
];

/** Starters that browsers added before seeding was tracked per starter. */
export const LEGACY_STARTER_IDS = ['adventure-park', 'kingdom'].map((k) => stableId(`starter:${k}:project`));

const STARTER_DATE_DEV = '2026-10-31T00:00:00.000Z';

/** The owner's blank "Development" layout for trying things out (added 31 Oct 2026). */
function developmentProject(): Project {
  const sid = (part: string) => stableId(`starter:development:${part}`);
  const p = createProject({ name: 'Development', description: 'Blank layout for trying things out.', table: { widthIn: 96, depthIn: 42, name: '3.5 × 8 ft table' } });
  const level = sid('level:main');
  const layerIds = new Map(p.layers.map((l, i) => [l.id, sid(`layer:${i}`)]));
  return {
    ...p,
    id: sid('project'),
    revisionId: sid('revision:0'),
    createdAt: STARTER_DATE_DEV,
    updatedAt: STARTER_DATE_DEV,
    origin: 'starter:development',
    levels: p.levels.map((l) => ({ ...l, id: level })),
    layers: p.layers.map((l) => ({ ...l, id: layerIds.get(l.id)! })),
    tables: p.tables.map((t) => ({ ...t, id: sid('table:main'), levelId: level, layerId: layerIds.get(t.layerId)! })),
  };
}
let cache: StarterResult[] | null = null;

/** Starter projects: the two Visio displays, then the blank Development layout. */
export function starterProjects(): StarterResult[] {
  if (!cache) {
    const rows = parseVisioCsv(csvText);
    cache = [...STARTER_SPECS.map((spec) => buildStarterProject(spec, rows, STARTER_DATE)), { project: developmentProject(), notes: [] }];
  }
  return cache.map((r) => ({ project: structuredClone(r.project), notes: r.notes }));
}
