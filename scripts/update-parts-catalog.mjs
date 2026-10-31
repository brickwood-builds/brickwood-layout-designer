// Builds src/data/parts-catalog.json from Rebrickable's free daily CSV downloads
// (https://rebrickable.com/downloads/). Run by hand when you want newer parts:
//
//   node scripts/update-parts-catalog.mjs
//
// Keeps plain (unprinted) parts in the categories useful for a layout, with size in studs,
// height in plates, smooth/round, and the colours each part has been made in.
import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BASE = 'https://cdn.rebrickable.com/media/downloads/';
const OUT = new URL('../src/data/parts-catalog.json', import.meta.url);

/** Rebrickable category id → short label, and whether its parts are plate height / brick height. */
const CATEGORIES = {
  14: ['Plates', 1], 9: ['Plates special', 1], 49: ['Plates wedged', 1], 21: ['Plates round', 1], 1: ['Baseplates', 1],
  19: ['Tiles', 1], 15: ['Tiles special', 1], 67: ['Tiles round', 1],
  11: ['Bricks', 3], 5: ['Bricks special', 3], 3: ['Slopes', 3], 6: ['Bricks wedged', 3], 37: ['Bricks curved', 3], 20: ['Bricks round', 3],
  16: ['Windows and doors', null], 23: ['Panels', null], 32: ['Fences and bars', null], 33: ['Rock', null], 38: ['Flags and signs', null],
  76: ['Plants and trees', null], 28: ['Animals', null],
};
const SMOOTH_CATS = new Set([19, 15, 67]);

async function csv(name) {
  const res = await fetch(BASE + name + '.csv.gz');
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') {
        cells.push(cur);
        cur = '';
      }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const num = (s) => {
  // "2", "1/2", "2 2/3"
  const m = s.trim().match(/^(\d+)?\s*(?:(\d+)\/(\d+))?$/);
  if (!m) return NaN;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
};
const SIZE = /(\d+(?:\s\d+\/\d+|\/\d+)?) x (\d+(?:\s\d+\/\d+|\/\d+)?)(?: x (\d+(?:\s\d+\/\d+|\/\d+)?))?/;
const PRINTED = /(pr\d|pat\d|px\d|pb\d|stk|pat$)/i;
const DECORATED = /\b(Pattern|Print|Printed|Sticker|Decorated|Embossed|Marbled)\b/i;

const [parts, colors, elements] = await Promise.all([csv('parts'), csv('colors'), csv('elements')]);

const colorsOf = new Map();
for (const e of elements) {
  const id = Number(e.color_id);
  if (id < 0 || id === 9999) continue;
  if (!colorsOf.has(e.part_num)) colorsOf.set(e.part_num, new Set());
  colorsOf.get(e.part_num).add(id);
}

const out = [];
for (const p of parts) {
  const cat = Number(p.part_cat_id);
  if (!(cat in CATEGORIES) || p.part_material !== 'Plastic') continue;
  if (PRINTED.test(p.part_num) || DECORATED.test(p.name)) continue;
  const [label, catHeight] = CATEGORIES[cat];
  const m = p.name.match(SIZE);
  let width = 1;
  let depth = 1;
  let height = null;
  let sizeKnown = false;
  if (m) {
    const a = num(m[1]);
    const b = num(m[2]);
    if (a > 0 && b > 0) {
      width = Math.max(a, b);
      depth = Math.min(a, b);
      sizeKnown = true;
      if (m[3]) height = Math.round(num(m[3]) * 3 * 100) / 100;
    }
  }
  if (height === null && catHeight !== null) height = /\bPlate\b/.test(p.name) && catHeight === 3 ? 1 : catHeight;
  const smooth = SMOOTH_CATS.has(cat) || /\bTile\b|No Studs|without Studs/i.test(p.name);
  const round = sizeKnown && width === depth && /\b(Round|Dish|Cone|Cylinder)\b/.test(p.name) && !/Corner|Half|Quarter|Rounded/.test(p.name);
  const cs = [...(colorsOf.get(p.part_num) ?? [])].sort((x, y) => x - y);
  const name = p.name.replace(/(\d) x (\d)/g, '$1×$2').replace(/(\d) x (\d)/g, '$1×$2');
  // [part no, name, category, width, depth, height (plates, -1 unknown), flags, colour ids]
  const flags = (smooth ? 1 : 0) | (round ? 2 : 0) | (sizeKnown ? 0 : 4);
  out.push([p.part_num, name, label, width, depth, height ?? -1, flags, cs]);
}
// Most-made parts first (more colours ≈ more common), so searches show the usual ones.
out.sort((a, b) => b[7].length - a[7].length || a[1].localeCompare(b[1]));

const used = new Set(out.flatMap((p) => p[7]));
const palette = colors
  .filter((c) => used.has(Number(c.id)))
  .map((c) => [Number(c.id), c.name, '#' + c.rgb.toLowerCase(), c.is_trans === 'True' || c.is_trans === 't' ? 1 : 0]);

const doc = {
  source: 'Rebrickable (rebrickable.com) — LEGO parts and colours, free CSV downloads',
  generated: new Date().toISOString().slice(0, 10),
  colors: palette,
  parts: out,
};
writeFileSync(OUT, JSON.stringify(doc));
console.log(`${out.length} parts, ${palette.length} colours → ${OUT.pathname}`);
