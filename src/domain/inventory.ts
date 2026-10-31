// Phase 3B: what a layout needs, what you have, and what to buy (FR-08).
// "What you have" is one list for all projects (your parts bin), kept on this device and
// in CSV files. Parts are identified by Rebrickable part number + LEGO colour name.
import { z } from 'zod';
import { partNumberOf } from './brush';
import { legoColorName } from './legoColors';
import type { Project } from './schema';

export const InventorySchema = z.object({
  /** Quantities you have, by "<part no>|<colour name>". */
  have: z.record(z.string(), z.number().int().nonnegative()),
  updatedAt: z.string(),
});
export type Inventory = z.infer<typeof InventorySchema>;

export const emptyInventory = (): Inventory => ({ have: {}, updatedAt: new Date(0).toISOString() });
export const partKey = (partNo: string, colorName: string) => `${partNo}|${colorName}`;
export const haveOf = (inv: Inventory, partNo: string, colorName: string) => inv.have[partKey(partNo, colorName)] ?? 0;

export function setHave(inv: Inventory, partNo: string, colorName: string, qty: number): Inventory {
  const have = { ...inv.have };
  const k = partKey(partNo, colorName);
  if (qty > 0) have[k] = Math.floor(qty);
  else delete have[k];
  return { have, updatedAt: new Date().toISOString() };
}

export interface NeededPart {
  partNo: string;
  name: string;
  colorName: string;
  color: string;
  needed: number;
}

export interface PartsNeeded {
  parts: NeededPart[];
  /** Pieces made up by hand (no part number), and stairs (planning shapes): not counted. */
  unnumbered: number;
  stairs: number;
}

/** Real parts this layout uses, by part and colour (all levels). */
export function partsNeeded(p: Project): PartsNeeded {
  const m = new Map<string, NeededPart>();
  let unnumbered = 0;
  let stairs = 0;
  for (const o of p.objects) {
    if (o.type !== 'piece') continue;
    if (o.catalogKey === 'stairs') {
      stairs++;
      continue;
    }
    const partNo = partNumberOf(o);
    if (!partNo) {
      unnumbered++;
      continue;
    }
    const colorName = legoColorName(o.color) ?? o.color;
    const k = partKey(partNo, colorName);
    const e = m.get(k) ?? { partNo, name: o.name, colorName, color: o.color, needed: 0 };
    e.needed++;
    m.set(k, e);
  }
  return { parts: [...m.values()].sort((a, b) => b.needed - a.needed || a.name.localeCompare(b.name)), unnumbered, stairs };
}

export interface ShoppingRow extends NeededPart {
  have: number;
  toBuy: number;
}

export function shoppingList(needed: NeededPart[], inv: Inventory): ShoppingRow[] {
  return needed.map((n) => {
    const have = haveOf(inv, n.partNo, n.colorName);
    return { ...n, have, toBuy: Math.max(0, n.needed - have) };
  });
}

const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csvLine = (cells: (string | number)[]) => cells.map(cell).join(',');

/**
 * Shopping list in Rebrickable's parts-list format (Part, Color id, Quantity). Import it on
 * rebrickable.com to see prices or turn it into a BrickLink wanted list. Colours without a
 * Rebrickable id are listed in `skipped`.
 */
export function rebrickableCsv(rows: ShoppingRow[], colorIds: Map<string, number>): { csv: string; skipped: ShoppingRow[] } {
  const skipped: ShoppingRow[] = [];
  const lines = ['Part,Color,Quantity'];
  for (const r of rows) {
    if (r.toBuy <= 0) continue;
    const id = colorIds.get(r.colorName);
    if (id === undefined) skipped.push(r);
    else lines.push(csvLine([r.partNo, id, r.toBuy]));
  }
  return { csv: lines.join('\n') + '\n', skipped };
}

/** The whole list, for reading or for another supplier. */
export function partsListCsv(rows: ShoppingRow[]): string {
  return [csvLine(['Part', 'Name', 'Colour', 'Needed', 'Have', 'To buy']), ...rows.map((r) => csvLine([r.partNo, r.name, r.colorName, r.needed, r.have, r.toBuy]))].join('\n') + '\n';
}

/** What you have, as CSV (Part, Colour, Quantity) — a backup, or to move to another device. */
export function inventoryCsv(inv: Inventory): string {
  const rows = Object.entries(inv.have)
    .map(([k, q]) => {
      const [partNo, colorName] = k.split('|') as [string, string];
      return [partNo, colorName, q] as const;
    })
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }) || a[1].localeCompare(b[1]));
  return [csvLine(['Part', 'Colour', 'Quantity']), ...rows.map((r) => csvLine([...r]))].join('\n') + '\n';
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export interface InventoryImport {
  /** Quantities read, by part key (rows for the same part and colour are added up). */
  rows: Map<string, number>;
  /** Lines that couldn't be read, with why. */
  problems: string[];
}

/**
 * Read a parts CSV: our own export, Rebrickable's (Part, Color id, Quantity) or a similar
 * file with Part / Colour / Quantity columns. Colours may be names or Rebrickable ids.
 */
export function readInventoryCsv(text: string, colorNameById: Map<number, string>): InventoryImport {
  const [head, ...body] = parseCsv(text.replace(/^\uFEFF/, ''));
  const problems: string[] = [];
  const rows = new Map<string, number>();
  if (!head) return { rows, problems: ['The file is empty.'] };
  const h = head.map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
  const iPart = col('part', 'part no', 'part number', 'partno', 'itemid', 'item no', 'design id');
  const iColor = col('color', 'colour', 'color name', 'colour name', 'colorname', 'color id');
  const iQty = col('quantity', 'qty', 'count', 'have', 'minqty');
  if (iPart < 0 || iColor < 0 || iQty < 0) return { rows, problems: ['The first line needs columns named Part, Colour (or Color) and Quantity.'] };
  body.forEach((r, n) => {
    const line = n + 2;
    const partNo = (r[iPart] ?? '').trim();
    const rawColor = (r[iColor] ?? '').trim();
    const qty = Number((r[iQty] ?? '').trim());
    if (!partNo) return;
    if (!Number.isFinite(qty) || qty < 0) return problems.push(`Line ${line}: “${r[iQty] ?? ''}” isn’t a quantity.`);
    const colorName = /^-?\d+$/.test(rawColor) ? colorNameById.get(Number(rawColor)) : rawColor;
    if (!colorName) return problems.push(`Line ${line}: colour “${rawColor}” isn’t known.`);
    const k = partKey(partNo, colorName);
    rows.set(k, (rows.get(k) ?? 0) + Math.floor(qty));
  });
  return { rows, problems };
}

/** Apply an import: each part and colour in the file gets the file's quantity. Others stay. */
export function applyImport(inv: Inventory, imp: InventoryImport): Inventory {
  const have = { ...inv.have };
  for (const [k, q] of imp.rows) {
    if (q > 0) have[k] = q;
    else delete have[k];
  }
  return { have, updatedAt: new Date().toISOString() };
}
