// Live part lookup with the user's own free Rebrickable key (decision "Parts lookup source",
// 18 Nov 2026): Rebrickable API v3, called straight from the browser. Requests are batched
// (part_nums + inc_part_details=1) and spaced out to about one a second, as Rebrickable asks.
import type { LibraryPart } from '../domain/partsLibrary';

export const API_BASE = 'https://rebrickable.com/api/v3';
/** Rebrickable asks for no more than about one request a second. */
export const MIN_GAP_MS = 1100;

/** Rebrickable category id → the short label the bundled parts list uses, and plate height. */
const CATEGORIES: Record<number, [string, number | null]> = {
  14: ['Plates', 1], 9: ['Plates special', 1], 49: ['Plates wedged', 1], 21: ['Plates round', 1], 1: ['Baseplates', 1],
  19: ['Tiles', 1], 15: ['Tiles special', 1], 67: ['Tiles round', 1],
  11: ['Bricks', 3], 5: ['Bricks special', 3], 3: ['Slopes', 3], 6: ['Bricks wedged', 3], 37: ['Bricks curved', 3], 20: ['Bricks round', 3],
  16: ['Windows and doors', null], 23: ['Panels', null], 32: ['Fences and bars', null], 33: ['Rock', null], 38: ['Flags and signs', null],
  76: ['Plants and trees', null], 28: ['Animals', null],
};
const SMOOTH_CATS = new Set([19, 15, 67]);

export class RebrickableError extends Error {
  constructor(
    message: string,
    readonly kind: 'key' | 'busy' | 'offline' | 'other',
  ) {
    super(message);
    this.name = 'RebrickableError';
  }
}

/** One part as Rebrickable's /lego/parts/ list returns it (only the fields used). */
export interface RbPart {
  part_num: string;
  name: string;
  part_cat_id: number;
  part_img_url?: string | null;
  external_ids?: Record<string, string[]>;
}

const num = (s: string) => {
  const m = s.trim().match(/^(\d+)?\s*(?:(\d+)\/(\d+))?$/);
  if (!m) return NaN;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
};
const SIZE = /(\d+(?:\s\d+\/\d+|\/\d+)?) x (\d+(?:\s\d+\/\d+|\/\d+)?)(?: x (\d+(?:\s\d+\/\d+|\/\d+)?))?/;

/** Turn a Rebrickable part into a parts-list entry (same rules as scripts/update-parts-catalog.mjs). */
export function toLibraryPart(p: RbPart): LibraryPart {
  const [category, catHeight] = CATEGORIES[p.part_cat_id] ?? ['Other', null];
  const m = p.name.match(SIZE);
  let width = 1;
  let depth = 1;
  let height: number | null = null;
  let sizeKnown = false;
  if (m) {
    const a = num(m[1]!);
    const b = num(m[2]!);
    if (a > 0 && b > 0) {
      width = Math.max(a, b);
      depth = Math.min(a, b);
      sizeKnown = true;
      if (m[3]) height = Math.round(num(m[3]) * 3 * 100) / 100;
    }
  }
  if (height === null && catHeight !== null) height = /\bPlate\b/.test(p.name) && catHeight === 3 ? 1 : catHeight;
  const smooth = SMOOTH_CATS.has(p.part_cat_id) || /\bTile\b|No Studs|without Studs/i.test(p.name);
  const round = sizeKnown && width === depth && /\b(Round|Dish|Cone|Cylinder)\b/.test(p.name) && !/Corner|Half|Quarter|Rounded/.test(p.name);
  const blNo = p.external_ids?.BrickLink?.[0];
  return {
    key: `rb:${p.part_num}`,
    partNo: p.part_num,
    ...(blNo ? { blNo } : {}),
    name: p.name.replace(/(\d) x (\d)/g, '$1×$2').replace(/(\d) x (\d)/g, '$1×$2'),
    category,
    width,
    depth,
    height,
    smooth,
    round,
    sizeKnown,
    // Rebrickable lists colours per part with one request each; the colour picker offers all.
    colors: [],
  };
}

/** Part numbers typed in ("3001", "3001 3020, 60479"), or null when it's a word search. */
export function partNumbersIn(query: string): string[] | null {
  const tokens = query.trim().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return null;
  // A part number has a digit and no spaces; "2x4" is a size, not a part number.
  const isNo = (t: string) => /^[0-9][0-9a-z.-]*$/i.test(t) && !/^\d+x\d+$/i.test(t);
  return tokens.every(isNo) ? tokens : null;
}

export class RebrickableClient {
  private last = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private key: () => string,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
    private now: () => number = () => Date.now(),
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** One GET, queued so calls are at least MIN_GAP_MS apart. */
  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    const run = async () => {
      const wait = this.last + MIN_GAP_MS - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
      const key = this.key();
      if (!key) throw new RebrickableError('Add your Rebrickable key to look parts up online', 'key');
      let res: Response;
      try {
        res = await this.fetchImpl(`${API_BASE}${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `key ${key}`, Accept: 'application/json' } });
      } catch {
        throw new RebrickableError('Can’t reach Rebrickable — are you online?', 'offline');
      }
      if (res.status === 401 || res.status === 403) throw new RebrickableError('Rebrickable didn’t accept the key — check it in Rebrickable key settings', 'key');
      if (res.status === 429) throw new RebrickableError('Rebrickable is busy — try again in a minute', 'busy');
      if (!res.ok) throw new RebrickableError(`Rebrickable: error ${res.status}`, 'other');
      return (await res.json()) as T;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async parts(params: Record<string, string>): Promise<LibraryPart[]> {
    const json = await this.get<{ results: RbPart[] }>('/lego/parts/', { ...params, inc_part_details: '1', page_size: params.page_size ?? '100' });
    return json.results.map(toLibraryPart);
  }

  /** Check the key works (one small request). */
  async check(): Promise<void> {
    await this.get('/lego/colors/', { page_size: '1' });
  }

  /**
   * Look parts up: part numbers in one batched request (Rebrickable numbers, then BrickLink
   * numbers for any not found), or a word search.
   */
  async lookup(query: string): Promise<LibraryPart[]> {
    const nos = partNumbersIn(query);
    if (!nos) return this.parts({ search: query.trim(), page_size: '30' });
    const found = await this.parts({ part_nums: nos.join(',') });
    const missing = nos.filter((n) => !found.some((p) => p.partNo.toLowerCase() === n.toLowerCase()));
    for (const n of missing) {
      const byBl = await this.parts({ bricklink_id: n, page_size: '5' });
      found.push(...byBl.filter((p) => !found.some((f) => f.key === p.key)));
    }
    return found;
  }
}
