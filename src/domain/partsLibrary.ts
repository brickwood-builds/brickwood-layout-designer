// The full LEGO parts list (Phase 3, FR-07): about 2,400 plain parts useful for a layout,
// from Rebrickable's free downloads (see scripts/update-parts-catalog.mjs). It ships with
// the app, so it works offline. Each part keeps its source part number (FR-07.01).
import { LEGO_COLORS, lego } from './legoColors';
import type { PaintTemplate } from './brush';

export const PARTS_SOURCE = 'Rebrickable';
export const PARTS_SOURCE_URL = 'https://rebrickable.com/';

/** One part from the library. */
export interface LibraryPart {
  /** "rb:<part number>", stored on placed pieces as catalogKey. */
  key: string;
  /** Rebrickable part number (usually the same as BrickLink's). */
  partNo: string;
  name: string;
  category: string;
  width: number;
  depth: number;
  /** Plates; null when the list doesn't say. */
  height: number | null;
  smooth: boolean;
  round: boolean;
  /** False when the size isn't in the part's name: placed as 1×1 to be sized by hand. */
  sizeKnown: boolean;
  /** Names of the real colours it has been made in (only those offered by the colour picker). */
  colors: string[];
}

export interface PartsLibrary {
  source: string;
  generated: string;
  parts: LibraryPart[];
  byNo: Map<string, LibraryPart>;
  /** Rebrickable colour id by colour name (for parts-list exports), and back. */
  colorIds: Map<string, number>;
  colorNames: Map<number, string>;
}

type RawPart = [string, string, string, number, number, number, number, number[]];
interface RawDoc {
  source: string;
  generated: string;
  colors: [number, string, string, number][];
  parts: RawPart[];
}

const OFFERED = new Set(LEGO_COLORS.map((c) => c.name));

export function buildLibrary(doc: RawDoc): PartsLibrary {
  const colorName = new Map(doc.colors.map(([id, name]) => [id, name]));
  const parts = doc.parts.map(([partNo, name, category, width, depth, height, flags, colorIds]): LibraryPart => ({
    key: `rb:${partNo}`,
    partNo,
    name,
    category,
    width,
    depth,
    height: height < 0 ? null : height,
    smooth: !!(flags & 1),
    round: !!(flags & 2),
    sizeKnown: !(flags & 4),
    colors: colorIds.map((id) => colorName.get(id)).filter((n): n is string => !!n && OFFERED.has(n)),
  }));
  return {
    source: doc.source,
    generated: doc.generated,
    parts,
    byNo: new Map(parts.map((p) => [p.partNo, p])),
    colorIds: new Map(doc.colors.map(([id, name]) => [name, id])),
    colorNames: new Map(doc.colors.map(([id, name]) => [id, name])),
  };
}

let loading: Promise<PartsLibrary> | null = null;
let loaded: PartsLibrary | null = null;

/** Load the parts list (a separate download the first time; cached for offline use). */
export function loadLibrary(): Promise<PartsLibrary> {
  loading ??= import('../data/parts-catalog.json').then((m) => (loaded = buildLibrary(m.default as unknown as RawDoc)));
  return loading;
}

/** The parts list if it has already been loaded. */
export const libraryIfLoaded = () => loaded;

const norm = (s: string) => s.toLowerCase().replace(/×/g, 'x').replace(/(\d)\s*x\s*(\d)/g, '$1x$2');

/**
 * Search by name, size, category or part number: "tile 2x2", "3024", "bush", "slope 45".
 * Part-number matches come first, then the most common parts.
 */
export function searchLibrary(lib: PartsLibrary, query: string, limit = 40): { parts: LibraryPart[]; total: number } {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { parts: [], total: 0 };
  const exact: LibraryPart[] = [];
  const rest: LibraryPart[] = [];
  for (const p of lib.parts) {
    const no = p.partNo.toLowerCase();
    if (words.length === 1 && no === words[0]) {
      exact.unshift(p);
      continue;
    }
    const text = `${norm(p.name)} ${p.category.toLowerCase()} ${no}`;
    if (!words.every((w) => text.includes(w))) continue;
    if (words.some((w) => no.startsWith(w))) exact.push(p);
    else rest.push(p);
  }
  const all = [...exact, ...rest];
  return { parts: all.slice(0, limit), total: all.length };
}

/** Colour a newly placed part starts in: a usual one it's made in. */
export function defaultColorName(p: Pick<LibraryPart, 'colors' | 'category'>): string {
  const prefer = /plant/i.test(p.category) ? ['Green', 'Bright Green', 'Dark Green'] : /rock/i.test(p.category) ? ['Dark Bluish Gray', 'Light Bluish Gray'] : ['Light Bluish Gray', 'Tan', 'White', 'Reddish Brown', 'Black'];
  return prefer.find((c) => p.colors.includes(c)) ?? p.colors[0] ?? 'Light Bluish Gray';
}

/** What to place or draw with for a library part. */
export function libraryTemplate(p: LibraryPart, colorName = defaultColorName(p)): PaintTemplate {
  return {
    type: 'piece',
    name: p.name,
    width: p.width,
    depth: p.depth,
    color: lego(colorName),
    catalogKey: p.key,
    ...(p.round ? { round: true } : {}),
    ...(p.smooth ? { smooth: true } : {}),
    ...(p.height !== null ? { heightPlates: p.height } : {}),
  };
}

/** Short size text: "2×4", "1×1 (size not known)". */
export const sizeText = (p: Pick<LibraryPart, 'width' | 'depth' | 'sizeKnown'>) => (p.sizeKnown ? `${p.depth}×${p.width}` : 'size not known');
