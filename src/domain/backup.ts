// Back up everything (Phase 7, FR-13.04 / FR-13.07 / TR-30): every project, its named
// versions and build photos, and your parts book, in one file that needs nothing but this app.
// Restoring shows what's in the file first; you choose what comes back.
import { z } from 'zod';
import { migrateProject } from './migrations';
import type { Project } from './schema';

export const BACKUP_KIND = 'brickwood-backup';
export const BACKUP_EXTENSION = '.brickwood-backup.json';

export const BackupSchema = z.object({
  kind: z.literal(BACKUP_KIND),
  version: z.literal(1),
  createdAt: z.string(),
  app: z.string(),
  projects: z.array(z.unknown()),
  versions: z.array(z.object({ id: z.string(), projectId: z.string(), createdAt: z.string(), name: z.string(), note: z.string(), doc: z.unknown() })).default([]),
  photos: z.array(z.object({ id: z.string(), projectId: z.string(), createdAt: z.string(), caption: z.string(), thumb: z.string(), data: z.string(), type: z.string() })).default([]),
  inventory: z.unknown().optional(),
});
export type Backup = z.infer<typeof BackupSchema>;

export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Brickwood backup.');
  }
  const r = BackupSchema.safeParse(raw);
  if (!r.success) throw new Error('That file isn’t a Brickwood backup.');
  return r.data;
}

export type RestoreStatus = 'new' | 'same' | 'newer' | 'older' | 'damaged';

export interface RestoreItem {
  id: string;
  name: string;
  status: RestoreStatus;
  updatedAt: string;
  versions: number;
  photos: number;
  project?: Project;
}

/** What restoring would do, project by project, compared with what is on this device. */
export function restorePlan(backup: Backup, here: Project[]): RestoreItem[] {
  const byId = new Map(here.map((p) => [p.id, p]));
  return backup.projects.map((raw, i) => {
    let project: Project;
    try {
      project = migrateProject(raw);
    } catch {
      return { id: `damaged-${i}`, name: 'A project that can’t be read', status: 'damaged' as const, updatedAt: '', versions: 0, photos: 0 };
    }
    const mine = byId.get(project.id);
    const status: RestoreStatus = !mine ? 'new' : mine.revisionId === project.revisionId ? 'same' : project.updatedAt > mine.updatedAt ? 'newer' : 'older';
    return {
      id: project.id,
      name: project.name,
      status,
      updatedAt: project.updatedAt,
      versions: backup.versions.filter((v) => v.projectId === project.id).length,
      photos: backup.photos.filter((ph) => ph.projectId === project.id).length,
      project,
    };
  });
}

export const RESTORE_LABEL: Record<RestoreStatus, string> = {
  new: 'Not on this device',
  same: 'Same as here',
  newer: 'Newer than here',
  older: 'Older than here',
  damaged: 'Can’t be read',
};

/** Picked by default: what the device doesn't have, or has an older copy of. */
export const restoreByDefault = (i: RestoreItem) => i.status === 'new' || i.status === 'newer';

// Base64 without Node or DOM helpers that differ between browser and tests.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < bytes.length ? B64[n & 63]! : '=');
  }
  return out;
}

export function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(new ArrayBuffer(Math.floor((clean.length * 3) / 4)));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]!) << 18) | (B64.indexOf(clean[i + 1]!) << 12) | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export const backupFileName = (d = new Date()) => `brickwood-backup-${d.toISOString().slice(0, 10)}${BACKUP_EXTENSION}`;
