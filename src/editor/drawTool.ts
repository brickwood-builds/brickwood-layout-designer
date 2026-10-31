// What the Draw tool paints with: a single piece from the catalog, or this project's own
// pieces, small items and markers.
import { STARTER_PARTS } from '../domain/catalog';
import type { PaintTemplate, WhenTaken } from '../domain/brush';
import { touchingSpacing, type StampSource, type Turn } from '../domain/stamps';
import type { Project } from '../domain/schema';

export interface StairDraft {
  width: number;
  stepDepth: number;
  risePlates: number;
  startPlates: number;
  landingEvery: number;
  smooth: boolean;
}

export interface DrawSettings {
  /** "part:<catalog key>", "shape:<shape id>" or "design:<design id>". */
  source: string;
  color: string;
  /** Brush width across, in studs. */
  width: number;
  shape: 'free' | 'line' | 'box' | 'curve' | 'stairs';
  erase: boolean;
  /** Over existing pieces: skip (walkways) or stack on top (slopes, hills). */
  whenTaken: WhenTaken;
  /** Pattern stamping: one every N studs (0 = solid, like a brush). */
  spacing: number;
  /** How stamps are turned. */
  turn: Turn;
  /** Settings for new stairs. */
  stair: StairDraft;
}

export const DEFAULT_DRAW: DrawSettings = {
  source: 'part:round-1x1',
  color: STARTER_PARTS.find((p) => p.key === 'round-1x1')!.color,
  width: 2,
  shape: 'free',
  erase: false,
  whenTaken: 'skip',
  spacing: 0,
  turn: 0,
  stair: { width: 4, stepDepth: 2, risePlates: 1, startPlates: 0, landingEvery: 0, smooth: true },
};

export const designIdOf = (d: DrawSettings) => (d.source.startsWith('design:') ? d.source.slice(7) : null);

/** Stamping (one every N studs, or a design) rather than painting solid. Not for erasing. */
export const isStamping = (d: DrawSettings) => !d.erase && d.shape !== 'stairs' && (d.spacing > 0 || !!designIdOf(d));

export function stampSource(project: Project, d: DrawSettings): StampSource {
  const designId = designIdOf(d);
  if (designId && project.designs.some((x) => x.id === designId)) return { kind: 'design', designId };
  return { kind: 'piece', template: paintTemplate(project, d) };
}

/** Centre-to-centre distance for stamps; "Solid" with a design means copies just touching. */
export function stampSpacing(project: Project, d: DrawSettings): number {
  return d.spacing > 0 ? d.spacing : touchingSpacing(project, stampSource(project, d));
}

export interface DrawSource {
  key: string;
  label: string;
  template: PaintTemplate;
}

export function drawSources(project: Project): DrawSource[] {
  const parts: DrawSource[] = STARTER_PARTS.map((p) => ({
    key: `part:${p.key}`,
    label: p.name,
    template: { type: 'piece', name: p.name, width: p.width, depth: p.depth, color: p.color, round: p.round, smooth: !p.studs, catalogKey: p.key },
  }));
  const own: DrawSource[] = project.shapes.map((s) => ({
    key: `shape:${s.id}`,
    label: s.name,
    template: { type: s.type, name: s.name, width: s.width, depth: s.depth, color: s.color, round: s.round, smooth: s.smooth, catalogKey: `shape:${s.id}` },
  }));
  return [...parts, ...own];
}

/** The template to paint with, in the chosen colour. */
export function paintTemplate(project: Project, d: DrawSettings): PaintTemplate {
  const src = drawSources(project).find((s) => s.key === d.source) ?? drawSources(project).find((s) => s.key === DEFAULT_DRAW.source)!;
  return { ...src.template, color: d.color };
}
