import { z } from 'zod';

/**
 * Canonical portable project format (one document per project).
 *
 * Coordinates: studs, origin at the upper-left of the level, X right, Y down.
 * x/y is the upper-left corner of an object's footprint *as placed* (after rotation);
 * width/depth are the unrotated size. Decimal studs are allowed and never rounded to inches.
 * Heights (future) are in plates, Z up.
 */
export const SCHEMA_VERSION = 1;

const id = z.uuid();
const studs = z.number().finite();
const positive = z.number().finite().positive();
const rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const timestamp = z.iso.datetime();

const placed = {
  id,
  levelId: id,
  layerId: id,
  x: studs,
  y: studs,
  width: positive,
  depth: positive,
  rotation,
  notes: z.string().default(''),
  /** Reserved for Phase 2 stacking; plates above the support surface. */
  baseHeightPlates: z.number().finite().optional(),
  heightPlates: z.number().finite().nonnegative().optional(),
};

export const LevelSchema = z.object({
  id,
  name: z.string().min(1),
  /** Support surface elevation above floor, in inches (physical furniture unit). */
  elevationIn: z.number().finite().nonnegative(),
  /** Horizontal position of this level in the combined overview, studs. */
  offsetX: studs,
  offsetY: studs,
  visible: z.boolean(),
  order: z.number().int(),
});

/** A support surface (table / plywood top). Reusable equipment, modelled as its own object. */
export const TableSchema = z.object({
  ...placed,
  name: z.string().min(1),
  /** Future link to a reusable equipment record (Phase 5). */
  equipmentId: id.optional(),
});

export const MILS_KINDS = ['16x8', '16x16', '32x16', '32x32', 'custom'] as const;
export const MilsKindSchema = z.enum(MILS_KINDS);

export const MilsModuleSchema = z.object({
  ...placed,
  kind: MilsKindSchema,
  /**
   * User-visible ID written on the back of the plate, e.g. B-07 or C01-V. Unique per project when set.
   * Empty when the plate is not labelled, e.g. a building built directly on its plate (one unit).
   */
  label: z.string(),
  /** Optional descriptive name, e.g. "Food Court" or "Mountain Castle". */
  name: z.string().default(''),
  color: color.optional(),
});

export const OBJECT_TYPES = ['footprint', 'setupMarker', 'item'] as const;

export const CanvasObjectSchema = z.object({
  ...placed,
  /** footprint = ride/building outline; setupMarker = placeholder brick; item = other small piece. */
  type: z.enum(OBJECT_TYPES),
  name: z.string(),
  color,
  /** Setup marker vocabulary key, e.g. "lamp", "tree". */
  markerKind: z.string().optional(),
  /** Ride power, kept for later power/packing planning. */
  powerVolts: z.number().positive().optional(),
});

export const LayerSchema = z.object({
  id,
  name: z.string().min(1),
  visible: z.boolean(),
  locked: z.boolean(),
  order: z.number().int(),
});

export const GroupSchema = z.object({
  id,
  name: z.string().min(1),
  memberIds: z.array(id),
});

export const SettingsSchema = z.object({
  displayUnit: z.enum(['studs', 'in', 'cm']),
  snap: z.enum(['full', 'half', 'free']),
  showGrid: z.boolean(),
  showLabels: z.boolean(),
});

/** Advanced areas stay hidden until the user switches them on. */
export const FeaturesSchema = z.object({
  heights: z.boolean(),
  inventory: z.boolean(),
  versions: z.boolean(),
  exhibitions: z.boolean(),
  transport: z.boolean(),
  helpers: z.boolean(),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id,
  name: z.string().trim().min(1, 'Project name is required').max(120),
  description: z.string().default(''),
  createdAt: timestamp,
  updatedAt: timestamp,
  /** Monotonic local revision; saves must name the revision they were based on. */
  revision: z.number().int().nonnegative(),
  /** Unique per saved revision; lets future cloud sync detect divergent copies. */
  revisionId: id,
  archived: z.boolean(),
  /** Where the project came from, e.g. "starter:adventure-park". */
  origin: z.string().optional(),
  settings: SettingsSchema,
  features: FeaturesSchema,
  levels: z.array(LevelSchema).min(1),
  layers: z.array(LayerSchema).min(1),
  tables: z.array(TableSchema),
  modules: z.array(MilsModuleSchema),
  objects: z.array(CanvasObjectSchema),
  groups: z.array(GroupSchema),
  /** MILS labels that have been retired and must never be reused (e.g. B-24..B-27). */
  retiredLabels: z.array(z.string()),
  /**
   * IDs of plates that exist but are not in this layout (in storage, or removed from it).
   * New modules never get these automatically; typing one in puts that plate back.
   */
  storedLabels: z.array(z.string()).default([]),
});

export type Level = z.infer<typeof LevelSchema>;
export type Table = z.infer<typeof TableSchema>;
export type MilsKind = z.infer<typeof MilsKindSchema>;
export type MilsModule = z.infer<typeof MilsModuleSchema>;
export type CanvasObject = z.infer<typeof CanvasObjectSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Features = z.infer<typeof FeaturesSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Rotation = Project['modules'][number]['rotation'];

export const MILS_SIZES: Record<Exclude<MilsKind, 'custom'>, { width: number; depth: number }> = {
  '16x8': { width: 16, depth: 8 },
  '16x16': { width: 16, depth: 16 },
  '32x16': { width: 32, depth: 16 },
  '32x32': { width: 32, depth: 32 },
};

export const MILS_COLORS: Record<MilsKind, string> = {
  '16x8': '#ab9ac0',
  '16x16': '#4bacc6',
  '32x16': '#7fbf9a',
  '32x32': '#92d050',
  custom: '#ffd965',
};

/** Text that identifies a module on screen: its ID, else its name. */
export function moduleDisplayName(m: Pick<MilsModule, 'label' | 'name'>): string {
  return m.label.trim() || m.name.trim() || 'Unnamed module';
}

/** Infer the module kind from its size (either orientation). */
export function milsKindForSize(width: number, depth: number): MilsKind {
  for (const [kind, s] of Object.entries(MILS_SIZES)) {
    if ((s.width === width && s.depth === depth) || (s.width === depth && s.depth === width)) {
      return kind as MilsKind;
    }
  }
  return 'custom';
}
