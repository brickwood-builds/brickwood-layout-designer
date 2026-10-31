// What the Draw tool paints with: a single piece from the catalog, or this project's own
// pieces, small items and markers.
import { STARTER_PARTS } from '../domain/catalog';
import type { PaintTemplate, WhenTaken } from '../domain/brush';
import type { Project } from '../domain/schema';

export interface DrawSettings {
  /** "part:<catalog key>" or "shape:<shape id>". */
  source: string;
  color: string;
  /** Brush width across, in studs. */
  width: number;
  shape: 'free' | 'line' | 'box' | 'curve';
  erase: boolean;
  /** Over existing pieces: skip (walkways) or stack on top (slopes, hills). */
  whenTaken: WhenTaken;
}

export const DEFAULT_DRAW: DrawSettings = { source: 'part:round-1x1', color: STARTER_PARTS.find((p) => p.key === 'round-1x1')!.color, width: 2, shape: 'free', erase: false, whenTaken: 'skip' };

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
