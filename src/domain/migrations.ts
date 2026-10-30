import { ProjectSchema, SCHEMA_VERSION, type Project } from './schema';

export class ProjectFormatError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Step migrations keyed by the version they upgrade *from*.
 * Each must preserve all IDs. None exist yet: version 1 is the first released format.
 */
const MIGRATIONS: Record<number, Migration> = {};

/** Upgrade any supported stored/exported project document to the current schema, then validate. */
export function migrateProject(raw: unknown): Project {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProjectFormatError('This is not a Brickwood project.');
  }
  let doc = raw as Record<string, unknown>;
  let version = doc.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ProjectFormatError('This project has no valid schema version.');
  }
  if (version > SCHEMA_VERSION) {
    throw new ProjectFormatError(
      `This project was saved by a newer version of Brickwood Layout Designer (format ${version}). Please update the app.`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new ProjectFormatError(`No upgrade path from format ${version}.`);
    doc = { ...step(doc), schemaVersion: version + 1 };
    version += 1;
  }
  const result = ProjectSchema.safeParse(doc);
  if (!result.success) {
    const details = result.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new ProjectFormatError('The project file is damaged or incomplete.', details);
  }
  return result.data;
}
