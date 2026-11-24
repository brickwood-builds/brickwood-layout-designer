import type { projectStats } from '../domain/project';
import { SHAPE_LABEL } from '../domain/tableShape';
import type { Project } from '../domain/schema';
import { formatFeetInches } from '../domain/units';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function summary(s: ReturnType<typeof projectStats>): string {
  const parts = [plural(s.modules, 'module')];
  if (s.footprints) parts.push(plural(s.footprints, 'feature'));
  if (s.markers) parts.push(plural(s.markers, 'marker'));
  if (s.items) parts.push(plural(s.items, 'item'));
  return parts.join(' · ');
}

export function tableSize(p: Project): string {
  const t = p.tables[0];
  if (!t) return 'No table';
  // The first table's level: its whole surface (an L, U or ring is several table pieces).
  const level = p.levels.find((l) => l.id === t.levelId);
  const pieces = p.tables.filter((x) => x.levelId === t.levelId);
  const w = Math.max(...pieces.map((x) => x.x + x.width)) - Math.min(...pieces.map((x) => x.x));
  const d = Math.max(...pieces.map((x) => x.y + x.depth)) - Math.min(...pieces.map((x) => x.y));
  const shape = level?.tableShape ? `${SHAPE_LABEL[level.tableShape.kind]} ` : '';
  return `${formatFeetInches(w)} × ${formatFeetInches(d)} ${shape}table`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
