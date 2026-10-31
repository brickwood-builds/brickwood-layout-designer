// Real LEGO colours, by the names used by BrickLink/Rebrickable, with their usual
// screen colours. Colour pickers offer only these (owner request).

export interface LegoColor {
  name: string;
  hex: string;
}

export const LEGO_COLORS: LegoColor[] = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Light Bluish Gray', hex: '#a0a5a9' },
  { name: 'Dark Bluish Gray', hex: '#6c6e68' },
  { name: 'Black', hex: '#05131d' },
  { name: 'Red', hex: '#c91a09' },
  { name: 'Dark Red', hex: '#720e0f' },
  { name: 'Coral', hex: '#ff698f' },
  { name: 'Orange', hex: '#fe8a18' },
  { name: 'Bright Light Orange', hex: '#f8bb3d' },
  { name: 'Dark Orange', hex: '#a95500' },
  { name: 'Yellow', hex: '#f2cd37' },
  { name: 'Bright Light Yellow', hex: '#fff03a' },
  { name: 'Tan', hex: '#e4cd9e' },
  { name: 'Dark Tan', hex: '#958a73' },
  { name: 'Light Nougat', hex: '#f6d7b3' },
  { name: 'Nougat', hex: '#d09168' },
  { name: 'Medium Nougat', hex: '#aa7d55' },
  { name: 'Reddish Brown', hex: '#582a12' },
  { name: 'Dark Brown', hex: '#352100' },
  { name: 'Lime', hex: '#bbe90b' },
  { name: 'Yellowish Green', hex: '#dfeea5' },
  { name: 'Bright Green', hex: '#4b9f4a' },
  { name: 'Green', hex: '#237841' },
  { name: 'Dark Green', hex: '#184632' },
  { name: 'Sand Green', hex: '#a0bcac' },
  { name: 'Olive Green', hex: '#9b9a5a' },
  { name: 'Dark Turquoise', hex: '#008f9b' },
  { name: 'Aqua', hex: '#b3d7d1' },
  { name: 'Medium Azure', hex: '#36aebf' },
  { name: 'Dark Azure', hex: '#078bc9' },
  { name: 'Bright Light Blue', hex: '#9fc3e9' },
  { name: 'Medium Blue', hex: '#5a93db' },
  { name: 'Blue', hex: '#0055bf' },
  { name: 'Sand Blue', hex: '#6074a1' },
  { name: 'Dark Blue', hex: '#0a3463' },
  { name: 'Lavender', hex: '#e1d5ed' },
  { name: 'Medium Lavender', hex: '#ac78ba' },
  { name: 'Dark Purple', hex: '#3f3691' },
  { name: 'Bright Pink', hex: '#e4adc8' },
  { name: 'Dark Pink', hex: '#c870a0' },
  { name: 'Magenta', hex: '#923978' },
  { name: 'Pearl Gold', hex: '#aa7f2e' },
  { name: 'Flat Silver', hex: '#898788' },
  { name: 'Trans-Clear', hex: '#eeeeee' },
];

const byHex = new Map(LEGO_COLORS.map((c) => [c.hex, c]));
const byName = new Map(LEGO_COLORS.map((c) => [c.name.toLowerCase(), c]));

/** Name of a LEGO colour from its hex, or undefined if it isn't one. */
export const legoColorName = (hex: string | undefined) => (hex ? byHex.get(hex.toLowerCase())?.name : undefined);

/** Hex of a LEGO colour by name (throws on typos, so catalog data can't drift). */
export function lego(name: string): string {
  const c = byName.get(name.toLowerCase());
  if (!c) throw new Error(`Unknown LEGO colour: ${name}`);
  return c.hex;
}

/** Plate colour used for "Finished look" when a module has none set. */
export const DEFAULT_PLATE_COLOR = lego('Green');
