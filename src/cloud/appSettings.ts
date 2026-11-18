// App settings that follow the user between devices, kept apart from project files:
// a small file in the app's OneDrive folder (settings/app-settings.json) and a copy on each
// device. Today it holds only the Rebrickable key (decision "Parts lookup source", 18 Nov 2026).
//
// The key is never put in a project file, export, backup or read-only share: it lives only
// in this device's meta store (which backups don't include) and in this one OneDrive file.
// Whichever side changed it last wins; clearing the key is a change too, so it clears everywhere.
import type { ProjectRepository } from '../storage/repository';
import { RemoteChangedError, type CloudDrive } from './drive';

export const SETTINGS_PATH = 'settings/app-settings.json';
const LOCAL = 'settings:app';
const SEEN = 'cloud:seen:app-settings';

export interface AppSettings {
  /** The user's own Rebrickable API key; '' when not set. */
  rebrickableKey: string;
  /** When it was last changed (ISO), on whichever device. */
  changedAt: string;
}

const EMPTY: AppSettings = { rebrickableKey: '', changedAt: '' };

function parse(text: string): AppSettings | null {
  try {
    const v = JSON.parse(text) as Partial<AppSettings>;
    if (typeof v.rebrickableKey !== 'string' || typeof v.changedAt !== 'string') return null;
    return { rebrickableKey: v.rebrickableKey, changedAt: v.changedAt };
  } catch {
    return null;
  }
}

export async function getAppSettings(repo: ProjectRepository): Promise<AppSettings> {
  return (await repo.getMeta<AppSettings>(LOCAL)) ?? EMPTY;
}

/** Change a setting on this device (it goes to OneDrive at the next sync). */
export async function setRebrickableKey(repo: ProjectRepository, key: string, now = new Date().toISOString()): Promise<AppSettings> {
  const next: AppSettings = { rebrickableKey: key.trim(), changedAt: now };
  await repo.setMeta(LOCAL, next);
  return next;
}

/**
 * Bring this device's settings and the OneDrive file into step. Returns what happened:
 * 'taken' (this device now has the other device's settings), 'sent', or null (nothing to do).
 */
export async function syncAppSettings(repo: ProjectRepository, drive: CloudDrive): Promise<'taken' | 'sent' | null> {
  const local = await repo.getMeta<AppSettings>(LOCAL);
  const remoteFile = await drive.read(SETTINGS_PATH);
  const remote = remoteFile ? parse(remoteFile.text) : null;
  if (remote && remoteFile && (!local || remote.changedAt > local.changedAt)) {
    await repo.setMeta(LOCAL, remote);
    await repo.setMeta(SEEN, remoteFile.eTag);
    return 'taken';
  }
  if (local && (!remote || local.changedAt > remote.changedAt)) {
    try {
      const { eTag } = await drive.write(SETTINGS_PATH, JSON.stringify(local), remoteFile?.eTag ?? null);
      await repo.setMeta(SEEN, eTag);
      return 'sent';
    } catch (e) {
      // Another device wrote it a moment ago: the next sync sorts out which is newer.
      if (e instanceof RemoteChangedError) return null;
      throw e;
    }
  }
  return null;
}
