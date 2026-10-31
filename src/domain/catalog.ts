// Starter catalog: a few common parts for small items. Sizes in studs, footprint only.
// The full parts catalog (BrickLink etc.) is Phase 3.
import { MARKER_KINDS } from './markers';
import { lego } from './legoColors';

export interface CatalogPart {
  key: string;
  name: string;
  width: number;
  depth: number;
  color: string;
  round?: boolean;
}

export const STARTER_PARTS: CatalogPart[] = [
  { key: 'brick-1x2', name: 'Brick 1×2', width: 2, depth: 1, color: lego('Red') },
  { key: 'brick-1x4', name: 'Brick 1×4', width: 4, depth: 1, color: lego('Red') },
  { key: 'brick-2x2', name: 'Brick 2×2', width: 2, depth: 2, color: lego('Red') },
  { key: 'brick-2x4', name: 'Brick 2×4', width: 4, depth: 2, color: lego('Red') },
  { key: 'plate-1x2', name: 'Plate 1×2', width: 2, depth: 1, color: lego('Light Bluish Gray') },
  { key: 'plate-2x2', name: 'Plate 2×2', width: 2, depth: 2, color: lego('Light Bluish Gray') },
  { key: 'plate-2x4', name: 'Plate 2×4', width: 4, depth: 2, color: lego('Light Bluish Gray') },
  { key: 'plate-4x4', name: 'Plate 4×4', width: 4, depth: 4, color: lego('Light Bluish Gray') },
  { key: 'tile-1x2', name: 'Tile 1×2', width: 2, depth: 1, color: lego('Yellow') },
  { key: 'tile-2x2', name: 'Tile 2×2', width: 2, depth: 2, color: lego('Yellow') },
  { key: 'round-2x2', name: 'Round 2×2', width: 2, depth: 2, color: lego('Light Bluish Gray'), round: true },
];

export const markerKind = (key: string | undefined) => MARKER_KINDS.find((m) => m.key === key);
