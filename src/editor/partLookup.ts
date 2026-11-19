// Live Rebrickable lookup on screen: the user's key, and every part ever looked up, cached on
// this device so it can be found and placed again offline. The key is entered once; with
// OneDrive sync on, it follows the user to their other devices through a small settings file
// (see cloud/appSettings.ts). Without OneDrive it's simply entered on each device.
import { useSyncExternalStore } from 'react';
import { getAppSettings, setRebrickableKey } from '../cloud/appSettings';
import { RebrickableClient } from '../cloud/rebrickable';
import { cloud } from '../cloud/service';
import { searchLibrary, shownPartNo, type LibraryPart } from '../domain/partsLibrary';
import type { ProjectRepository } from '../storage/repository';

const CACHE = 'rebrickable:cache';

export interface LookupState {
  ready: boolean;
  hasKey: boolean;
  /** Parts looked up before, newest first. */
  cached: LibraryPart[];
}

export class PartLookup {
  state: LookupState = { ready: false, hasKey: false, cached: [] };
  private key = '';
  private listeners = new Set<() => void>();
  readonly client: RebrickableClient;

  constructor(
    private repo: ProjectRepository,
    fetchImpl?: typeof fetch,
    clientFor?: (key: () => string) => RebrickableClient,
  ) {
    this.client = clientFor ? clientFor(() => this.key) : new RebrickableClient(() => this.key, fetchImpl);
  }

  private set(patch: Partial<LookupState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  async init() {
    await this.reloadKey();
    const cached = (await this.repo.getMeta<LibraryPart[]>(CACHE)) ?? [];
    this.set({ ready: true, cached: Array.isArray(cached) ? cached : [] });
  }

  /** Read the key again (after sync brought one from another device). */
  async reloadKey() {
    this.key = (await getAppSettings(this.repo)).rebrickableKey;
    this.set({ hasKey: !!this.key });
  }

  /** Save (or, with '', remove) the key on this device; it goes to OneDrive at the next sync. */
  async saveKey(key: string) {
    await setRebrickableKey(this.repo, key);
    await this.reloadKey();
    cloud()?.syncSoon(500);
  }

  /** Check a key works before saving it. Throws RebrickableError when it doesn't. */
  async checkKey(key: string) {
    const c = new RebrickableClient(() => key.trim());
    await c.check();
  }

  /** Look parts up on Rebrickable and keep them for offline use. */
  async lookup(query: string): Promise<LibraryPart[]> {
    const found = await this.client.lookup(query);
    if (found.length) {
      const keys = new Set(found.map((p) => p.key));
      const cached = [...found, ...this.state.cached.filter((p) => !keys.has(p.key))];
      await this.repo.setMeta(CACHE, cached);
      this.set({ cached });
    }
    return found;
  }

  /** Parts looked up before that match a search (works offline). */
  searchCached(query: string, limit = 40) {
    return searchLibrary({ parts: this.state.cached }, query, limit);
  }

  /** A part looked up before, by the BrickLink number placed pieces store. */
  byBrickLinkNo(blNo: string) {
    return this.state.cached.find((p) => shownPartNo(p) === blNo) ?? null;
  }
}

let service: PartLookup | null = null;

export function initPartLookup(repo: ProjectRepository): PartLookup {
  if (service) return service;
  const s = (service = new PartLookup(repo));
  // A key entered on another device arrives with OneDrive sync.
  cloud()?.onSettingsTaken(() => void s.reloadKey());
  return s;
}
export const partLookup = () => service;

const EMPTY: LookupState = { ready: false, hasKey: false, cached: [] };
export function usePartLookup(): LookupState {
  return useSyncExternalStore(
    (l) => service?.subscribe(l) ?? (() => undefined),
    () => service?.state ?? EMPTY,
  );
}
