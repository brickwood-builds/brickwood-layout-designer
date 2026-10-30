import csvText from '../../docs/brickwood-visio-layouts.csv?raw';
import { buildStarterProject, parseVisioCsv, type StarterResult, type StarterSpec } from './visioImport';

/** Fixed creation date so starter projects are identical on every device. */
const STARTER_DATE = '2026-10-30T00:00:00.000Z';

export const STARTER_SPECS: StarterSpec[] = [
  {
    key: 'adventure-park',
    display: 'AdventurePark_BaseplatesLayout_v5',
    name: 'Brickwood Adventure Park',
    description: 'Current Adventure Park layout (Visio v5). Build left to right.',
    table: {
      name: 'Two 6 ft tables + 3.5 × 15.5 ft top',
      widthIn: 186,
      depthIn: 42,
      notes: 'Two 6 ft folding tables topped with a 3.5 × 15.5 ft surface (42 × 186 in).',
    },
    retiredLabels: ['B-24', 'B-25', 'B-26', 'B-27'],
    power: {
      'Loop Coaster': 4.5,
      'Blast Off': 4.5,
      'Carousel 2': 7.5,
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
      Carousel: 'Assumed to be the Big Carousel (9 V).',
      'Carousel 2': 'Assumed to be the Small Carousel (7.5 V).',
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

let cache: StarterResult[] | null = null;

export function starterProjects(): StarterResult[] {
  if (!cache) {
    const rows = parseVisioCsv(csvText);
    cache = STARTER_SPECS.map((spec) => buildStarterProject(spec, rows, STARTER_DATE));
  }
  return cache.map((r) => ({ project: structuredClone(r.project), notes: r.notes }));
}
