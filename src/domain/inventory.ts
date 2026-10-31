// Phase 3B: what a layout needs, what you have, and what to buy (FR-08).
// "What you have" is one list for all projects (your parts bin), kept on this device and
// in CSV files. Parts are identified by Rebrickable part number + LEGO colour name.
import { z } from 'zod';
import { partNumberOf } from './brush';
import { legoColorName } from './legoColors';
import type { Project } from './schema';

const money = z.number().finite().nonnegative();

export const SUPPLIERS = ['bricklink', 'brickwith'] as const;
export type Supplier = (typeof SUPPLIERS)[number];
export const SUPPLIER_NAME: Record<Supplier, string> = { bricklink: 'BrickLink', brickwith: 'Brickwith' };

/**
 * Your parts book (one for all projects): what you have, which parts Brickwith makes
 * (a reusable cross-reference, FR-07.04), and prices. The layout always keeps the LEGO part;
 * buying the Brickwith equivalent is only a purchasing choice (FR-07.05/06).
 */
export const InventorySchema = z.object({
  /** Quantities you have, by "<part no>|<colour name>". */
  have: z.record(z.string(), z.number().int().nonnegative()),
  /** Parts (by part key) that Brickwith makes; `no` is their part number when it differs. */
  brickwith: z.record(z.string(), z.object({ no: z.string().optional() })).default({}),
  /** Price each, by "<supplier>|<part no>|<colour name>". */
  prices: z.record(z.string(), money).default({}),
  /** Usual price per piece when a part has no price of its own (for an estimate). */
  usualPrice: z.object({ bricklink: money.optional(), brickwith: money.optional() }).default({}),
  updatedAt: z.string(),
});
export type Inventory = z.infer<typeof InventorySchema>;

export const emptyInventory = (): Inventory => ({ have: {}, brickwith: {}, prices: {}, usualPrice: {}, updatedAt: new Date(0).toISOString() });
const touched = (inv: Inventory, change: Partial<Inventory>): Inventory => ({ ...inv, ...change, updatedAt: new Date().toISOString() });
const priceKey = (supplier: Supplier, partNo: string, colorName: string) => `${supplier}|${partNo}|${colorName}`;

export function setBrickwith(inv: Inventory, partNo: string, colorName: string, makes: boolean): Inventory {
  const brickwith = { ...inv.brickwith };
  if (makes) brickwith[partKey(partNo, colorName)] = brickwith[partKey(partNo, colorName)] ?? {};
  else delete brickwith[partKey(partNo, colorName)];
  return touched(inv, { brickwith });
}

export function setPrice(inv: Inventory, supplier: Supplier, partNo: string, colorName: string, each: number | null): Inventory {
  const prices = { ...inv.prices };
  if (each === null) delete prices[priceKey(supplier, partNo, colorName)];
  else prices[priceKey(supplier, partNo, colorName)] = each;
  return touched(inv, { prices });
}

export function setUsualPrice(inv: Inventory, supplier: Supplier, each: number | null): Inventory {
  const usualPrice = { ...inv.usualPrice };
  if (each === null) delete usualPrice[supplier];
  else usualPrice[supplier] = each;
  return touched(inv, { usualPrice });
}

/** Price each for a part from a supplier: its own price, else the usual one (an estimate). */
export function priceOf(inv: Inventory, supplier: Supplier, partNo: string, colorName: string): { each: number; own: boolean } | null {
  const own = inv.prices[priceKey(supplier, partNo, colorName)];
  if (own !== undefined) return { each: own, own: true };
  const usual = inv.usualPrice[supplier];
  return usual !== undefined ? { each: usual, own: false } : null;
}
export const partKey = (partNo: string, colorName: string) => `${partNo}|${colorName}`;
export const haveOf = (inv: Inventory, partNo: string, colorName: string) => inv.have[partKey(partNo, colorName)] ?? 0;

export function setHave(inv: Inventory, partNo: string, colorName: string, qty: number): Inventory {
  const have = { ...inv.have };
  const k = partKey(partNo, colorName);
  if (qty > 0) have[k] = Math.floor(qty);
  else delete have[k];
  return touched(inv, { have });
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
  /** Brickwith makes this part in this colour (from your parts book). */
  brickwithMakes: boolean;
  /** Where to buy it: Brickwith when the layout uses Brickwith first and they make it. */
  supplier: Supplier;
  /** Price each from that supplier (null = not known), and whether it's the part's own price. */
  each: number | null;
  ownPrice: boolean;
  /** toBuy × each (null when there's no price). */
  cost: number | null;
}

/** Needed vs have, and where to buy the rest (Brickwith first, else BrickLink). */
export function shoppingList(needed: NeededPart[], inv: Inventory, brickwithFirst = false): ShoppingRow[] {
  return needed.map((n) => {
    const have = haveOf(inv, n.partNo, n.colorName);
    const toBuy = Math.max(0, n.needed - have);
    const brickwithMakes = !!inv.brickwith[partKey(n.partNo, n.colorName)];
    const supplier: Supplier = brickwithFirst && brickwithMakes ? 'brickwith' : 'bricklink';
    const price = priceOf(inv, supplier, n.partNo, n.colorName);
    return { ...n, have, toBuy, brickwithMakes, supplier, each: price?.each ?? null, ownPrice: !!price?.own, cost: price ? Math.round(price.each * toBuy * 100) / 100 : null };
  });
}

export interface CostSummary {
  total: number;
  bySupplier: Record<Supplier, { pieces: number; cost: number; unpriced: number }>;
  /** Pieces to buy that have no price at all. */
  unpriced: number;
  /** Some of the total comes from usual prices, not the parts' own. */
  estimated: boolean;
}

export function costSummary(rows: ShoppingRow[]): CostSummary {
  const bySupplier: CostSummary['bySupplier'] = { bricklink: { pieces: 0, cost: 0, unpriced: 0 }, brickwith: { pieces: 0, cost: 0, unpriced: 0 } };
  let estimated = false;
  for (const r of rows) {
    if (!r.toBuy) continue;
    const s = bySupplier[r.supplier];
    s.pieces += r.toBuy;
    if (r.cost === null) s.unpriced += r.toBuy;
    else s.cost += r.cost;
    if (r.cost !== null && !r.ownPrice) estimated = true;
  }
  for (const s of Object.values(bySupplier)) s.cost = Math.round(s.cost * 100) / 100;
  return { total: Math.round((bySupplier.bricklink.cost + bySupplier.brickwith.cost) * 100) / 100, bySupplier, unpriced: bySupplier.bricklink.unpriced + bySupplier.brickwith.unpriced, estimated };
}

/** Money in the user's own currency format. */
export const formatMoney = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);

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
  return (
    [
      csvLine(['Part', 'Name', 'Colour', 'Needed', 'Have', 'To buy', 'Buy from', 'Price each', 'Cost']),
      ...rows.map((r) => csvLine([r.partNo, r.name, r.colorName, r.needed, r.have, r.toBuy, SUPPLIER_NAME[r.supplier], r.each ?? '', r.cost ?? ''])),
    ].join('\n') + '\n'
  );
}

/** What to order from Brickwith: their part number (usually the LEGO one), colour, quantity. */
export function brickwithCsv(rows: ShoppingRow[], inv: Inventory): string {
  const lines = [csvLine(['Part', 'Brickwith part', 'Name', 'Colour', 'Quantity', 'Price each'])];
  for (const r of rows) {
    if (r.supplier !== 'brickwith' || r.toBuy <= 0) continue;
    lines.push(csvLine([r.partNo, inv.brickwith[partKey(r.partNo, r.colorName)]?.no ?? r.partNo, r.name, r.colorName, r.toBuy, r.each ?? '']));
  }
  return lines.join('\n') + '\n';
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
  return touched(inv, { have });
}

/**
 * Read a Brickwith list: Part, Colour, and optionally Brickwith part and Price. Every row
 * marks that part and colour as made by Brickwith (and sets its Brickwith price).
 */
export function readBrickwithCsv(text: string, colorNameById: Map<number, string>): { apply: (inv: Inventory) => Inventory; count: number; problems: string[] } {
  const [head, ...body] = parseCsv(text.replace(/^\uFEFF/, ''));
  const problems: string[] = [];
  const found: { partNo: string; colorName: string; no?: string; price?: number }[] = [];
  const h = (head ?? []).map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
  const iPart = col('part', 'part no', 'part number', 'lego part', 'design id');
  const iColor = col('color', 'colour', 'color name', 'colour name', 'color id');
  const iNo = col('brickwith part', 'brickwith no', 'brickwith', 'supplier part');
  const iPrice = col('price', 'price each', 'each', 'unit price');
  if (iPart < 0 || iColor < 0) return { apply: (i) => i, count: 0, problems: ['The first line needs columns named Part and Colour (and Price, Brickwith part if you have them).'] };
  body.forEach((r, n) => {
    const partNo = (r[iPart] ?? '').trim();
    if (!partNo) return;
    const raw = (r[iColor] ?? '').trim();
    const colorName = /^-?\d+$/.test(raw) ? colorNameById.get(Number(raw)) : raw;
    if (!colorName) return problems.push(`Line ${n + 2}: colour “${raw}” isn’t known.`);
    const priceText = iPrice >= 0 ? (r[iPrice] ?? '').replace(/[^\d.]/g, '') : '';
    const price = priceText ? Number(priceText) : undefined;
    const no = iNo >= 0 ? (r[iNo] ?? '').trim() : '';
    found.push({ partNo, colorName, ...(no && no !== partNo ? { no } : {}), ...(price !== undefined && Number.isFinite(price) ? { price } : {}) });
  });
  const apply = (inv: Inventory): Inventory => {
    const brickwith = { ...inv.brickwith };
    const prices = { ...inv.prices };
    for (const f of found) {
      brickwith[partKey(f.partNo, f.colorName)] = f.no ? { no: f.no } : {};
      if (f.price !== undefined) prices[priceKey('brickwith', f.partNo, f.colorName)] = f.price;
    }
    return touched(inv, { brickwith, prices });
  };
  return { apply, count: found.length, problems };
}

/** Total money spent on a layout. */
export const spentTotal = (p: Pick<Project, 'spending'>) => Math.round(p.spending.reduce((n, s) => n + s.amount, 0) * 100) / 100;
