// Built-in parts list: common LEGO plates, tiles and bricks, so they don't have to be
// recreated in each project. Sizes in studs, heights in plates. Part numbers are the usual
// BrickLink numbers, for reference; the full parts catalog (any part, verified numbers,
// real colours per part) is Phase 3.
import { MARKER_KINDS } from './markers';
import { lego } from './legoColors';

export type PartKind = 'plate' | 'tile' | 'brick' | 'round plate' | 'round tile' | 'round brick';

export interface CatalogPart {
  key: string;
  name: string;
  kind: PartKind;
  width: number;
  depth: number;
  color: string;
  round?: boolean;
  /** Tiles are smooth: no studs on top. */
  studs: boolean;
  /** Height in plates (brick = 3). */
  height: number;
  /** BrickLink part number, for reference. */
  partNo?: string;
}

const KIND: Record<PartKind, { prefix: string; label: string; studs: boolean; height: number; round?: boolean; color: string }> = {
  plate: { prefix: 'plate', label: 'Plate', studs: true, height: 1, color: lego('Light Bluish Gray') },
  tile: { prefix: 'tile', label: 'Tile', studs: false, height: 1, color: lego('Yellow') },
  brick: { prefix: 'brick', label: 'Brick', studs: true, height: 3, color: lego('Red') },
  'round plate': { prefix: 'round', label: 'Plate Round', studs: true, height: 1, round: true, color: lego('Tan') },
  'round tile': { prefix: 'roundtile', label: 'Tile Round', studs: false, height: 1, round: true, color: lego('Light Bluish Gray') },
  'round brick': { prefix: 'roundbrick', label: 'Brick Round', studs: true, height: 3, round: true, color: lego('Reddish Brown') },
};

// [width, depth, BrickLink no.] — width is the longer side, as in "Plate 2×4".
const SIZES: Record<PartKind, [number, number, string][]> = {
  plate: [
    [1, 1, '3024'], [2, 1, '3023'], [3, 1, '3623'], [4, 1, '3710'], [6, 1, '3666'], [8, 1, '3460'], [10, 1, '4477'], [12, 1, '60479'],
    [2, 2, '3022'], [3, 2, '3021'], [4, 2, '3020'], [6, 2, '3795'], [8, 2, '3034'], [10, 2, '3832'], [12, 2, '2445'],
    [4, 4, '3031'], [6, 4, '3032'], [8, 4, '3035'], [10, 4, '3030'], [12, 4, '3029'],
    [6, 6, '3958'], [8, 6, '3036'], [10, 6, '3033'], [12, 6, '3028'], [8, 8, '41539'], [16, 8, '92438'],
  ],
  tile: [
    [1, 1, '3070b'], [2, 1, '3069b'], [3, 1, '63864'], [4, 1, '2431'], [6, 1, '6636'], [8, 1, '4162'],
    [2, 2, '3068b'], [3, 2, '26603'], [4, 2, '87079'], [6, 2, '69729'], [6, 6, '10202'],
  ],
  brick: [
    [1, 1, '3005'], [2, 1, '3004'], [3, 1, '3622'], [4, 1, '3010'], [6, 1, '3009'], [8, 1, '3008'],
    [2, 2, '3003'], [3, 2, '3002'], [4, 2, '3001'], [6, 2, '2456'], [8, 2, '3007'],
  ],
  'round plate': [[1, 1, '4073'], [2, 2, '4032'], [4, 4, '60474']],
  'round tile': [[1, 1, '98138'], [2, 2, '14769']],
  'round brick': [[1, 1, '3062b'], [2, 2, '3941']],
};

export const STARTER_PARTS: CatalogPart[] = (Object.keys(SIZES) as PartKind[]).flatMap((kind) =>
  SIZES[kind].map(([w, d, partNo]) => {
    const k = KIND[kind];
    // Long side first in the name ("Plate 2×4"); drawn with the long side across.
    return {
      key: `${k.prefix}-${d}x${w}`,
      name: `${k.label} ${d}×${w}`,
      kind,
      width: w,
      depth: d,
      color: k.color,
      studs: k.studs,
      height: k.height,
      partNo,
      ...(k.round ? { round: true } : {}),
    };
  }),
);

/** The few shown before searching: what walkways and setups use most. */
export const COMMON_PART_KEYS = ['round-1x1', 'plate-1x1', 'plate-1x2', 'plate-2x2', 'plate-2x4', 'tile-1x1', 'tile-1x2', 'tile-2x2', 'brick-2x2', 'brick-2x4'];

export const partByKey = (key: string | undefined) => STARTER_PARTS.find((p) => p.key === key);

/** Search by name, size or part number: "tile 2x2", "3024", "round". */
export function searchParts(query: string): CatalogPart[] {
  const words = query.toLowerCase().replace(/×/g, 'x').split(/\s+/).filter(Boolean);
  if (!words.length) return STARTER_PARTS.filter((p) => COMMON_PART_KEYS.includes(p.key));
  return STARTER_PARTS.filter((p) => {
    const text = `${p.name.replace(/×/g, 'x')} ${p.kind} ${p.partNo ?? ''}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

export const markerKind = (key: string | undefined) => MARKER_KINDS.find((m) => m.key === key);
