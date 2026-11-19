// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type BrickwoodDb } from '../../src/storage/db';
import { ProjectRepository } from '../../src/storage/repository';
import { createProject } from '../../src/domain/project';
import { exportProject } from '../../src/domain/exchange';
import { MemoryDrive } from '../../src/cloud/drive';
import { SyncEngine } from '../../src/cloud/sync';
import { SETTINGS_PATH, getAppSettings, setRebrickableKey, syncAppSettings } from '../../src/cloud/appSettings';
import { MIN_GAP_MS, RebrickableClient, RebrickableError, partNumbersIn, toLibraryPart, type RbPart } from '../../src/cloud/rebrickable';
import { PartLookup } from '../../src/editor/partLookup';
import { shownPartNo } from '../../src/domain/partsLibrary';

const dbs: BrickwoodDb[] = [];
afterEach(async () => {
  for (const db of dbs.splice(0)) {
    db.close();
    await db.delete();
  }
});
function repo() {
  const db = openDb(`rb-${crypto.randomUUID()}`);
  dbs.push(db);
  return new ProjectRepository(db);
}

const KEY = 'abcdef0123456789abcdef0123456789';
const PARTS: Record<string, RbPart> = {
  '3020': { part_num: '3020', name: 'Plate 2 x 4', part_cat_id: 14, external_ids: { BrickLink: ['3020'] } },
  '6141': { part_num: '6141', name: 'Plate Round 1 x 1', part_cat_id: 21, external_ids: { BrickLink: ['4073'] } },
  '3068b': { part_num: '3068b', name: 'Tile 2 x 2 with Groove', part_cat_id: 19, external_ids: { BrickLink: ['3068b'] } },
  '99999': { part_num: '99999', name: 'Odd Thing', part_cat_id: 999 },
};

/** A pretend Rebrickable API that records each request. */
function fakeApi() {
  const calls: { url: URL; auth: string | null }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get('Authorization');
    calls.push({ url, auth });
    if (auth !== `key ${KEY}`) return new Response('{"detail":"Invalid token."}', { status: 401 });
    const q = url.searchParams;
    let results: RbPart[] = [];
    if (q.get('part_nums')) results = q.get('part_nums')!.split(',').map((n) => PARTS[n]!).filter(Boolean);
    else if (q.get('bricklink_id')) results = Object.values(PARTS).filter((p) => p.external_ids?.BrickLink?.includes(q.get('bricklink_id')!));
    else if (q.get('search')) results = Object.values(PARTS).filter((p) => p.name.toLowerCase().includes(q.get('search')!.toLowerCase()));
    return Response.json({ count: results.length, results });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/** A clock the client waits on, so spacing between requests can be checked without waiting. */
function fakeClock() {
  let t = 1_000_000;
  const waits: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (waits.push(ms), (t += ms)), waits, advance: (ms: number) => (t += ms) };
}

describe('Rebrickable parts', () => {
  it('reads size, height, smooth/round and the BrickLink number from a Rebrickable part', () => {
    const plate = toLibraryPart(PARTS['3020']!);
    expect(plate).toMatchObject({ key: 'rb:3020', partNo: '3020', blNo: '3020', name: 'Plate 2×4', category: 'Plates', width: 4, depth: 2, height: 1, smooth: false, sizeKnown: true });
    const round = toLibraryPart(PARTS['6141']!);
    expect(round).toMatchObject({ partNo: '6141', blNo: '4073', round: true });
    expect(shownPartNo(round)).toBe('4073');
    expect(toLibraryPart(PARTS['3068b']!)).toMatchObject({ smooth: true, width: 2, depth: 2 });
    const odd = toLibraryPart(PARTS['99999']!);
    expect(odd).toMatchObject({ category: 'Other', sizeKnown: false, height: null });
    expect(odd.blNo).toBeUndefined();
    expect(shownPartNo(odd)).toBe('99999');
  });

  it('tells part numbers from word searches', () => {
    expect(partNumbersIn('3001')).toEqual(['3001']);
    expect(partNumbersIn('3001, 3020 3068b')).toEqual(['3001', '3020', '3068b']);
    expect(partNumbersIn('tile 2x2')).toBeNull();
    expect(partNumbersIn('2x4')).toBeNull();
    expect(partNumbersIn('  ')).toBeNull();
  });

  it('batches part numbers in one request with part details and the key, and spaces requests about a second apart', async () => {
    const api = fakeApi();
    const clock = fakeClock();
    const c = new RebrickableClient(() => KEY, api.fetchImpl, clock.now, clock.sleep);
    const found = await c.lookup('3020 6141');
    expect(found.map((p) => p.partNo)).toEqual(['3020', '6141']);
    expect(api.calls).toHaveLength(1);
    const q = api.calls[0]!.url.searchParams;
    expect(api.calls[0]!.url.pathname).toBe('/api/v3/lego/parts/');
    expect(q.get('part_nums')).toBe('3020,6141');
    expect(q.get('inc_part_details')).toBe('1');
    expect(api.calls[0]!.auth).toBe(`key ${KEY}`);
    // Two lookups at once still go out one at a time, at least MIN_GAP_MS apart.
    await Promise.all([c.lookup('3068b'), c.lookup('tile')]);
    expect(api.calls).toHaveLength(3);
    expect(clock.waits.length).toBe(2);
    expect(clock.waits.every((w) => w > 0 && w <= MIN_GAP_MS)).toBe(true);
  });

  it('finds a part by its BrickLink number when Rebrickable numbers it differently', async () => {
    const api = fakeApi();
    const clock = fakeClock();
    const c = new RebrickableClient(() => KEY, api.fetchImpl, clock.now, clock.sleep);
    const found = await c.lookup('4073');
    expect(found.map((p) => [p.partNo, p.blNo])).toEqual([['6141', '4073']]);
    expect(api.calls.map((x) => x.url.searchParams.get('bricklink_id'))).toEqual([null, '4073']);
  });

  it('explains a missing or wrong key, and being offline', async () => {
    const api = fakeApi();
    const clock = fakeClock();
    await expect(new RebrickableClient(() => '', api.fetchImpl, clock.now, clock.sleep).lookup('3020')).rejects.toMatchObject({ kind: 'key' });
    expect(api.calls).toHaveLength(0);
    await expect(new RebrickableClient(() => 'wrongkeywrongkeywrongkey', api.fetchImpl, clock.now, clock.sleep).lookup('3020')).rejects.toMatchObject({ kind: 'key' });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const err = await new RebrickableClient(() => KEY, offline, clock.now, clock.sleep).lookup('3020').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RebrickableError);
    expect((err as RebrickableError).kind).toBe('offline');
  });
});

describe('Looked-up parts are kept for offline use', () => {
  it('caches every part looked up; a later session finds them with no internet', async () => {
    const r = repo();
    const api = fakeApi();
    const clock = fakeClock();
    await setRebrickableKey(r, KEY);
    const online = new PartLookup(r, undefined, (key) => new RebrickableClient(key, api.fetchImpl, clock.now, clock.sleep));
    await online.init();
    expect(online.state.hasKey).toBe(true);
    await online.lookup('3020');
    await online.lookup('tile');
    expect(online.state.cached.map((p) => p.partNo)).toEqual(['3068b', '3020']);

    // Next day, at the show, no Wi-Fi.
    const offlineFetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const later = new PartLookup(r, offlineFetch);
    await later.init();
    expect(later.searchCached('plate 2x4').parts.map((p) => p.partNo)).toEqual(['3020']);
    expect(later.searchCached('3068b').parts.map((p) => p.partNo)).toEqual(['3068b']);
    expect(later.byBrickLinkNo('3020')?.blNo).toBe('3020');
    await expect(later.lookup('6141')).rejects.toMatchObject({ kind: 'offline' });
    expect(later.state.cached).toHaveLength(2);
  });
});

describe('The Rebrickable key syncs through a small OneDrive settings file', () => {
  it('a key entered on the computer reaches the iPad; removing it removes it everywhere', async () => {
    const drive = new MemoryDrive();
    const pc = repo();
    const ipad = repo();
    await setRebrickableKey(pc, KEY, '2026-11-18T10:00:00.000Z');
    expect(await syncAppSettings(pc, drive)).toBe('sent');
    expect([...drive.files.keys()]).toEqual([SETTINGS_PATH]);
    expect(await syncAppSettings(ipad, drive)).toBe('taken');
    expect((await getAppSettings(ipad)).rebrickableKey).toBe(KEY);
    // Nothing changed: nothing to do.
    expect(await syncAppSettings(ipad, drive)).toBeNull();
    expect(await syncAppSettings(pc, drive)).toBeNull();

    await setRebrickableKey(ipad, '', '2026-11-18T11:00:00.000Z');
    expect(await syncAppSettings(ipad, drive)).toBe('sent');
    expect(await syncAppSettings(pc, drive)).toBe('taken');
    expect((await getAppSettings(pc)).rebrickableKey).toBe('');
  });

  it('the newer change wins when both devices changed the key', async () => {
    const drive = new MemoryDrive();
    const pc = repo();
    const ipad = repo();
    await setRebrickableKey(pc, 'oldkeyoldkeyoldkeyoldkey', '2026-11-18T10:00:00.000Z');
    await setRebrickableKey(ipad, KEY, '2026-11-18T12:00:00.000Z');
    await syncAppSettings(pc, drive);
    expect(await syncAppSettings(ipad, drive)).toBe('sent');
    expect(await syncAppSettings(pc, drive)).toBe('taken');
    expect((await getAppSettings(pc)).rebrickableKey).toBe(KEY);
  });

  it('works without OneDrive: the key is kept on the device', async () => {
    const r = repo();
    const lookup = new PartLookup(r);
    await lookup.init();
    expect(lookup.state.hasKey).toBe(false);
    await lookup.saveKey(`  ${KEY} `);
    expect(lookup.state.hasKey).toBe(true);
    expect((await getAppSettings(r)).rebrickableKey).toBe(KEY);
  });

  it('the key never goes into project files, project sync, exports or backups', async () => {
    const drive = new MemoryDrive();
    const r = repo();
    const p = createProject({ name: 'Park', table: { widthIn: 30, depthIn: 30 } });
    await r.createProject(p);
    await setRebrickableKey(r, KEY);
    await new SyncEngine(r, drive).syncAll();
    await syncAppSettings(r, drive);
    for (const [path, f] of drive.files) if (path !== SETTINGS_PATH) expect(f.text).not.toContain(KEY);
    expect(exportProject(await r.getProject(p.id))).not.toContain(KEY);
    expect(JSON.stringify(await r.exportAll())).not.toContain(KEY);
  });
});
