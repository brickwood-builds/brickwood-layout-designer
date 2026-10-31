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

/** Operating clearance around a moving ride (FR-04.05): no motion simulation, just space. */
const clearance = {
  /** Studs of free space needed all around the footprint. */
  clearanceStuds: z.number().finite().nonnegative().optional(),
  /** Things lower than this (plates) may sit in the zone, e.g. tiles under swing seats. */
  clearAbovePlates: z.number().finite().nonnegative().optional(),
};

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
  /** Ride power in volts, for rides built on their own base. */
  powerVolts: z.number().positive().optional(),
  /** Real LEGO colour of the baseplate, used by "Finished look". */
  plateColor: color.optional(),
  ...clearance,
});

/** footprint = older ride/building outline; setupMarker; item = small item (street light, bush); piece = a single LEGO piece. */
export const OBJECT_TYPES = ['footprint', 'setupMarker', 'item', 'piece'] as const;

export const CanvasObjectSchema = z.object({
  ...placed,
  /** See OBJECT_TYPES. */
  type: z.enum(OBJECT_TYPES),
  name: z.string(),
  color,
  /** Setup marker vocabulary key, e.g. "lamp", "tree". */
  markerKind: z.string().optional(),
  /** Starter-catalog part or user shape this was placed from (reference only; size is stored here). */
  catalogKey: z.string().optional(),
  /** Drawn as a circle (round bricks and markers). */
  round: z.boolean().optional(),
  /** Smooth top, no studs (tiles). */
  smooth: z.boolean().optional(),
  /** Ride power, kept for later power/packing planning. */
  powerVolts: z.number().positive().optional(),
  ...clearance,
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
  /** A copy of a reusable design (linked), and the design version it was made from. */
  designId: id.optional(),
  designVersion: z.number().int().positive().optional(),
});

/** A reusable rectangle the user saved from the canvas ("My shapes"). */
export const ShapeSchema = z.object({
  id,
  name: z.string().min(1),
  type: z.enum(OBJECT_TYPES),
  width: positive,
  depth: positive,
  color,
  round: z.boolean().optional(),
  smooth: z.boolean().optional(),
});

/**
 * A reusable design (FR-05.01): things arranged once and placed as linked copies.
 * Items are stored relative to the design's upper-left corner. MILS plates are not
 * included (they are physical plates with their own IDs); features (bases) are.
 */
export const DesignSchema = z.object({
  id,
  name: z.string().min(1),
  version: z.number().int().positive(),
  updatedAt: timestamp,
  modules: z.array(MilsModuleSchema),
  objects: z.array(CanvasObjectSchema),
});

/**
 * An editable curve (FR-03.04): the control points a curve was drawn through and how it
 * was painted. Its pieces form a group; reshaping the curve re-lays them.
 */
export const CurveSchema = z.object({
  id,
  groupId: id,
  levelId: id,
  layerId: id,
  points: z.array(z.object({ x: studs, y: studs })).min(2),
  width: positive,
  whenTaken: z.enum(['skip', 'stack']),
  /** Pattern: one piece every N studs along the curve (absent = solid). */
  spacing: z.number().finite().positive().optional(),
  turn: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270), z.literal('follow')]).optional(),
  template: z.object({
    type: z.enum(OBJECT_TYPES),
    name: z.string(),
    width: positive,
    depth: positive,
    color,
    round: z.boolean().optional(),
    smooth: z.boolean().optional(),
    catalogKey: z.string().optional(),
    markerKind: z.string().optional(),
  }),
  /** Where the pieces were when last laid (to follow the group if it is moved). */
  bounds: z.object({ x: studs, y: studs, width: z.number().finite(), depth: z.number().finite() }),
});

/**
 * Stairs (FR-04.04): steps laid along a path of whole-stud straight runs. Turns get a
 * landing; each step is one rise higher. Heights are in plates. Its steps form a group;
 * changing the path or any setting lays them again.
 */
export const StairSchema = z.object({
  id,
  groupId: id,
  levelId: id,
  layerId: id,
  points: z.array(z.object({ x: studs, y: studs })).min(2),
  /** Studs across. */
  width: positive,
  /** Studs from the front of one step to the next. */
  stepDepth: positive,
  /** Plates each step goes up. */
  risePlates: z.number().finite().positive(),
  /** Plates the first step starts above what it sits on. */
  startPlates: z.number().finite().nonnegative(),
  /** A flat landing after every N steps (0 = only at turns). */
  landingEvery: z.number().int().nonnegative(),
  color,
  smooth: z.boolean(),
  bounds: z.object({ x: studs, y: studs, width: z.number().finite(), depth: z.number().finite() }),
});

export const BUILD_STATUSES = ['planned', 'building', 'built', 'partly-dismantled', 'dismantled', 'replaced'] as const;
export const BUILD_CONDITIONS = ['good', 'needs-repair', 'damaged'] as const;
export const HISTORY_KINDS = ['created', 'note', 'repair', 'condition', 'status', 'rebuilt', 'dismantled', 'replaced', 'photo', 'storage'] as const;

/**
 * A physical build (FR-05.02): one real thing you built — the castle, a ride on its base —
 * with a permanent ID that stays through repairs and rebuilds. It is not the design (a
 * reusable arrangement) and not the drawing: `itemIds` are the things on the plan that are it.
 */
export const BuildSchema = z.object({
  id,
  /** Permanent ID, e.g. PB-007. Never reused, also after it is replaced. */
  code: z.string().min(1),
  name: z.string().min(1),
  itemIds: z.array(id),
  /** The reusable design (and its version) it was built from, if any. */
  designId: id.optional(),
  designVersion: z.number().int().positive().optional(),
  status: z.enum(BUILD_STATUSES),
  condition: z.enum(BUILD_CONDITIONS),
  /** Where it is kept, e.g. "Garage shelf 3, tote 12". */
  storage: z.string().default(''),
  /** Build progress 0–100 while it is being built. */
  progress: z.number().min(0).max(100).default(0),
  milestones: z.array(z.object({ id, text: z.string().min(1), done: z.boolean(), doneAt: timestamp.optional() })).default([]),
  /** Setup instructions for this copy (shared ones belong to the design). */
  setupNotes: z.string().default(''),
  /** How this copy differs from its design (FR-05.04). */
  notes: z.string().default(''),
  /** Photo IDs (the pictures are kept on this device). */
  photos: z.array(id).default([]),
  replaces: id.optional(),
  replacedBy: id.optional(),
  history: z.array(z.object({ id, at: timestamp, kind: z.enum(HISTORY_KINDS), text: z.string() })).default([]),
  createdAt: timestamp,
});

/** Money spent on this layout (FR-08: cost tracking). */
export const SpendingSchema = z.object({
  id,
  /** yyyy-mm-dd */
  date: z.string(),
  /** Where: BrickLink, Brickwith, a LEGO store… */
  supplier: z.string(),
  note: z.string().default(''),
  amount: z.number().finite(),
});

/** A saved measurement on a level (FR-01.05), end points in studs. */
export const DimensionSchema = z.object({
  id,
  levelId: id,
  x1: studs,
  y1: studs,
  x2: studs,
  y2: studs,
  label: z.string().default(''),
});

/** A warning the user marked as intended (e.g. a deliberate overhang). Kept for audit. */
export const AcknowledgementSchema = z.object({
  /** Warning kind + sorted item IDs, e.g. "overhang:<id>". */
  key: z.string().min(1),
  message: z.string(),
  note: z.string().default(''),
  at: timestamp,
});

export const SettingsSchema = z.object({
  displayUnit: z.enum(['studs', 'in', 'cm']),
  snap: z.enum(['full', 'half', 'free']),
  showGrid: z.boolean(),
  /** Show MILS IDs and names on the plan (hide for a "finished look"). */
  showLabels: z.boolean(),
  /** 'size' colours modules by plate size (planning); 'plate' uses each plate's real colour. */
  moduleColors: z.enum(['size', 'plate']).default('size'),
  /** Heights: colour things by how high they are, to read slopes from above. */
  heightShading: z.boolean().default(false),
  /** Buying parts: Brickwith first with BrickLink for the rest, or genuine LEGO from BrickLink only. */
  brickwithFirst: z.boolean().default(false),
});

/** Advanced areas stay hidden until the user switches them on. */
export const FeaturesSchema = z.object({
  heights: z.boolean(),
  inventory: z.boolean(),
  versions: z.boolean(),
  exhibitions: z.boolean(),
  transport: z.boolean(),
  helpers: z.boolean(),
  /** Physical builds: permanent IDs, condition, storage, repairs, photos, progress. */
  builds: z.boolean().default(false),
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
  shapes: z.array(ShapeSchema).default([]),
  acknowledgements: z.array(AcknowledgementSchema).default([]),
  dimensions: z.array(DimensionSchema).default([]),
  designs: z.array(DesignSchema).default([]),
  curves: z.array(CurveSchema).default([]),
  stairs: z.array(StairSchema).default([]),
  spending: z.array(SpendingSchema).default([]),
  builds: z.array(BuildSchema).default([]),
  /** The named version chosen as the one to use (FR-06.02); versions are kept on the device. */
  preferredVersion: z.object({ id, name: z.string() }).optional(),
});

export type Level = z.infer<typeof LevelSchema>;
export type Table = z.infer<typeof TableSchema>;
export type MilsKind = z.infer<typeof MilsKindSchema>;
export type MilsModule = z.infer<typeof MilsModuleSchema>;
export type CanvasObject = z.infer<typeof CanvasObjectSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type Acknowledgement = z.infer<typeof AcknowledgementSchema>;
export type Dimension = z.infer<typeof DimensionSchema>;
export type Design = z.infer<typeof DesignSchema>;
export type Curve = z.infer<typeof CurveSchema>;
export type Stair = z.infer<typeof StairSchema>;
export type Spending = z.infer<typeof SpendingSchema>;
export type Build = z.infer<typeof BuildSchema>;
export type BuildStatus = Build['status'];
export type BuildCondition = Build['condition'];
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

/**
 * A ride or building built on its own base plate (no MILS ID, just a name), e.g. the
 * Ferris Wheel or the Tavern. It moves and packs as one unit.
 */
export const isBase = (m: Pick<MilsModule, 'label' | 'name'>) => !m.label.trim() && !!m.name.trim();

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
