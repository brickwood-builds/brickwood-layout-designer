/**
 * Setup-marker vocabulary: coloured placeholder bricks that show helpers where small
 * items go (from the Adventure Park setup notes). Sizes are in studs.
 * Used by the object editor (Milestone 1C); defined now so the data model is stable.
 */
import { lego } from './legoColors';

export interface MarkerKind {
  key: string;
  name: string;
  brick: string;
  width: number;
  depth: number;
  shape: 'square' | 'round';
  color: string;
}

export const MARKER_KINDS: MarkerKind[] = [
  { key: 'bench', name: 'Table / bench', brick: 'Green or orange 1×1 dot', width: 1, depth: 1, shape: 'round', color: lego('Green') },
  { key: 'flowers', name: 'Flowers', brick: 'Brown 1×4', width: 4, depth: 1, shape: 'square', color: lego('Reddish Brown') },
  { key: 'tree', name: 'Tree', brick: 'Sand 1×4', width: 4, depth: 1, shape: 'square', color: lego('Tan') },
  { key: 'lamp', name: 'Lamp', brick: 'White 2×2 square', width: 2, depth: 2, shape: 'square', color: lego('White') },
  { key: 'trash', name: 'Trash can', brick: 'Dark/light gray 2×2 round', width: 2, depth: 2, shape: 'round', color: lego('Dark Bluish Gray') },
  { key: 'bush', name: 'Bush', brick: 'Bright green 2×2 round', width: 2, depth: 2, shape: 'round', color: lego('Bright Green') },
  { key: 'bears', name: 'Bears', brick: 'Light gray 2×2 square', width: 2, depth: 2, shape: 'square', color: lego('Light Bluish Gray') },
  { key: 'pine', name: 'Pine tree', brick: 'Bright green 2×2 square', width: 2, depth: 2, shape: 'square', color: lego('Bright Green') },
  { key: 'flowerpot', name: 'Flower pot', brick: 'Dark green 2×2 plate, centre stud', width: 2, depth: 2, shape: 'square', color: lego('Dark Green') },
];
