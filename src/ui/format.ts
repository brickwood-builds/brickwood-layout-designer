import type { projectStats } from '../domain/project';
import type { Project } from '../domain/schema';
import { formatFeetInches } from '../domain/units';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function summary(s: ReturnType<typeof projectStats>): string {
  const parts = [plural(s.modules, 'module')];
  if (s.footprints) parts.push(`${s.footprints} rides & buildings`);
  if (s.markers) parts.push(plural(s.markers, 'marker'));
  if (s.items) parts.push(plural(s.items, 'item'));
  return parts.join(' · ');
}

export function tableSize(p: Project): string {
  const t = p.tables[0];
  if (!t) return 'No table';
  return `${formatFeetInches(t.width)} × ${formatFeetInches(t.depth)} table`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
