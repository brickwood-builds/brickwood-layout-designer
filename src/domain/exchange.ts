import { migrateProject, ProjectFormatError } from './migrations';
import type { Project } from './schema';

/** Portable export envelope. The file extension is .brickwood.json. */
export const EXPORT_FORMAT = 'brickwood-layout-project';
export const EXPORT_FORMAT_VERSION = 1;
export const EXPORT_EXTENSION = '.brickwood.json';

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  exportedAt: string;
  project: Project;
}

export function exportProject(project: Project): string {
  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(envelope, null, 2);
}

export function exportFileName(project: Project): string {
  const safe = project.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'project';
  return `${safe}${EXPORT_EXTENSION}`;
}

/** Parse and validate an exported file. Throws ProjectFormatError with a readable message. */
export function parseProjectFile(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFormatError('The file is not valid JSON, so it cannot be a Brickwood project.');
  }
  if (typeof data !== 'object' || data === null || (data as { format?: unknown }).format !== EXPORT_FORMAT) {
    throw new ProjectFormatError('This file is not a Brickwood Layout Designer export.');
  }
  const env = data as Partial<ExportEnvelope>;
  if (typeof env.formatVersion !== 'number' || env.formatVersion > EXPORT_FORMAT_VERSION) {
    throw new ProjectFormatError('This export was made by a newer version of the app. Please update the app.');
  }
  return migrateProject(env.project);
}
