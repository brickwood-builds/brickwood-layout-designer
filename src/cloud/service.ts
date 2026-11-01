// The app's connection to OneDrive: settings, sign-in, background sync and status.
// One instance for the whole app; screens read its state with useCloud().
import { useSyncExternalStore } from 'react';
import type { ProjectRepository } from '../storage/repository';
import { SignInNeededError } from './drive';
import { OneDrive, accessToken, completeSignIn, startSignIn, type CloudConfig, type TokenStore, type Tokens } from './onedrive';
import { SyncEngine, type Conflict, type SyncReport } from './sync';

export interface CloudState {
  /** An app registration (client ID) is set. */
  configured: boolean;
  signedIn: boolean;
  account: string;
  status: 'idle' | 'syncing' | 'offline' | 'error';
  error: string;
  lastSync: string | null;
  conflicts: Conflict[];
  last: SyncReport | null;
}

const BUILT_IN_CLIENT_ID = (import.meta.env.VITE_ONEDRIVE_CLIENT_ID as string | undefined) ?? '';
const SYNC_EVERY_MS = 5 * 60_000;
const AFTER_SAVE_MS = 4_000;

export class CloudService {
  state: CloudState = { configured: false, signedIn: false, account: '', status: 'idle', error: '', lastSync: null, conflicts: [], last: null };
  private listeners = new Set<() => void>();
  private takenListeners = new Set<(ids: string[]) => void>();
  private beforeSync = new Set<() => Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private config: CloudConfig | null = null;

  constructor(
    private repo: ProjectRepository,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private tokens: TokenStore = {
    get: async () => (await this.repo.getMeta<Tokens>('cloud:tokens')) ?? null,
    set: (t) => this.repo.setMeta('cloud:tokens', t ?? undefined),
  };

  private set(patch: Partial<CloudState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  /** Called when sync took a newer copy of these projects from another device. */
  onTaken(l: (ids: string[]) => void) {
    this.takenListeners.add(l);
    return () => {
      this.takenListeners.delete(l);
    };
  }

  /** Work to finish before syncing (the open editor saves its changes first). */
  addBeforeSync(f: () => Promise<void>) {
    this.beforeSync.add(f);
    return () => {
      this.beforeSync.delete(f);
    };
  }

  /** Start up: read settings, finish a sign-in if Microsoft just sent the user back, then sync. */
  async init(): Promise<void> {
    const saved = await this.repo.getMeta<CloudConfig>('cloud:config');
    this.config = saved?.clientId ? saved : BUILT_IN_CLIENT_ID ? { clientId: BUILT_IN_CLIENT_ID, authority: 'consumers' } : null;
    const lastSync = (await this.repo.getMeta<string>('cloud:lastSync')) ?? null;
    const conflicts = (await this.repo.getMeta<Conflict[]>('cloud:conflicts')) ?? [];
    this.set({ configured: !!this.config, lastSync, conflicts });
    if (!this.config) return;
    try {
      await completeSignIn(this.config, this.tokens, this.fetchImpl);
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
    const signedIn = !!(await this.tokens.get());
    this.set({ signedIn, account: (await this.repo.getMeta<string>('cloud:account')) ?? '' });
    if (signedIn) {
      window.addEventListener('online', () => this.syncSoon(500));
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.syncSoon(500));
      void this.syncNow();
    }
  }

  async configure(clientId: string, authority = 'consumers') {
    this.config = { clientId: clientId.trim(), authority };
    await this.repo.setMeta('cloud:config', this.config);
    this.set({ configured: !!clientId.trim() });
  }

  async signIn() {
    if (this.config) await startSignIn(this.config);
  }

  async signOut() {
    await this.tokens.set(null);
    // What this device "last saw" belongs to that account.
    await this.repo.deleteMetaPrefix('cloud:seen:');
    await this.repo.setMeta('cloud:conflicts', []);
    await this.repo.setMeta('cloud:account', undefined);
    this.set({ signedIn: false, account: '', conflicts: [], status: 'idle', error: '' });
  }

  private engine(): { engine: SyncEngine; drive: OneDrive } {
    const cfg = this.config!;
    const drive = new OneDrive(() => accessToken(cfg, this.tokens, this.fetchImpl), this.fetchImpl);
    return { engine: new SyncEngine(this.repo, drive), drive };
  }

  /** Sync soon (after a save), coalescing several requests into one. */
  syncSoon(delay = AFTER_SAVE_MS) {
    if (!this.state.signedIn) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), delay);
  }

  async syncNow(): Promise<void> {
    if (!this.config || !this.state.signedIn) return;
    if (this.running) return this.running;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.set({ status: 'offline' });
      this.syncSoon(SYNC_EVERY_MS);
      return;
    }
    this.running = (async () => {
      this.set({ status: 'syncing', error: '' });
      try {
        for (const f of this.beforeSync) await f();
        const { engine, drive } = this.engine();
        if (!this.state.account) {
          const account = await drive.account();
          await this.repo.setMeta('cloud:account', account);
          this.set({ account });
        }
        const report = await engine.syncAll();
        this.set({ status: 'idle', lastSync: new Date().toISOString(), conflicts: report.conflicts, last: report });
        const taken = [...report.taken, ...report.added];
        if (taken.length) this.takenListeners.forEach((l) => l(taken));
      } catch (e) {
        if (e instanceof SignInNeededError) this.set({ signedIn: (await this.tokens.get()) !== null, status: 'error', error: e.message });
        else this.set({ status: navigator.onLine === false ? 'offline' : 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        this.running = null;
        if (this.state.signedIn) {
          if (this.timer) clearTimeout(this.timer);
          this.timer = setTimeout(() => void this.syncNow(), SYNC_EVERY_MS);
        }
      }
    })();
    return this.running;
  }

  async resolve(projectId: string, keep: 'here' | 'there') {
    for (const f of this.beforeSync) await f();
    await this.engine().engine.resolve(projectId, keep);
    this.set({ conflicts: this.state.conflicts.filter((c) => c.projectId !== projectId) });
    if (keep === 'there') this.takenListeners.forEach((l) => l([projectId]));
  }
}

let service: CloudService | null = null;
export const initCloud = (repo: ProjectRepository) => (service ??= new CloudService(repo));
export const cloud = () => service;

const EMPTY: CloudState = { configured: false, signedIn: false, account: '', status: 'idle', error: '', lastSync: null, conflicts: [], last: null };
export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => service?.subscribe(l) ?? (() => undefined),
    () => service?.state ?? EMPTY,
  );
}
