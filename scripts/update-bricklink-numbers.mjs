// Builds src/data/bricklink-numbers.json: the BrickLink number of each part in the bundled
// parts list, where it differs from Rebrickable's (decision "Parts lookup source", 18 Nov 2026:
// BrickLink numbers are the part IDs shown and stored). Rebrickable's free CSV downloads don't
// include BrickLink numbers, so this asks the Rebrickable API in batches of 100 (about 25
// requests, one a second). Run it after update-parts-catalog.mjs, with your own free key:
//
//   REBRICKABLE_KEY=<your key> node scripts/update-bricklink-numbers.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.REBRICKABLE_KEY;
if (!KEY) throw new Error('Set REBRICKABLE_KEY to your Rebrickable API key');
const CATALOG = new URL('../src/data/parts-catalog.json', import.meta.url);
const OUT = new URL('../src/data/bricklink-numbers.json', import.meta.url);
// Parts in the starter list (src/domain/catalog.ts) not in the parts list.
const EXTRA = ['3062b', '3941', '6141', '4032b', '98138', '14769', '60474'];

const nos = [...new Set([...JSON.parse(readFileSync(CATALOG, 'utf8')).parts.map((p) => p[0]), ...EXTRA])];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const map = {};
let none = 0;
for (let i = 0; i < nos.length; i += 100) {
  const batch = nos.slice(i, i + 100);
  const q = new URLSearchParams({ part_nums: batch.join(','), inc_part_details: '1', page_size: '100' });
  const res = await fetch(`https://rebrickable.com/api/v3/lego/parts/?${q}`, { headers: { Authorization: `key ${KEY}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Rebrickable: HTTP ${res.status}`);
  const { results } = await res.json();
  for (const p of results) {
    const bl = p.external_ids?.BrickLink?.[0];
    if (!bl) none++;
    else if (bl !== p.part_num) map[p.part_num] = bl;
  }
  process.stdout.write(`\r${Math.min(i + 100, nos.length)} / ${nos.length}`);
  await sleep(1100);
}
const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })));
writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n');
console.log(`\n${Object.keys(sorted).length} parts numbered differently on BrickLink; ${none} with no BrickLink number → ${OUT.pathname}`);
