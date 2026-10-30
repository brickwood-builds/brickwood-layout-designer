// MILS ID conventions: A-xx = 16x8, B-xx = 16x16, C-xx = 32x32.
// Village modules use the "B01-V" style. Retired IDs are never reused.
import type { MilsKind, Project } from './schema';

const PREFIX: Partial<Record<MilsKind, string>> = { '16x8': 'A', '16x16': 'B', '32x32': 'C' };
const DASH = /^([A-Z])-(\d+)$/i;
const VILLAGE = /^([A-Z])(\d+)-V$/i;

const norm = (label: string) => label.trim().toUpperCase();

function parse(label: string): { prefix: string; n: number; village: boolean } | null {
  const d = DASH.exec(label.trim());
  if (d) return { prefix: d[1]!.toUpperCase(), n: Number(d[2]), village: false };
  const v = VILLAGE.exec(label.trim());
  if (v) return { prefix: v[1]!.toUpperCase(), n: Number(v[2]), village: true };
  return null;
}

/**
 * Next free ID for a module kind, following the style already used in the project
 * (B-07 or B07-V). Kinds without a convention (32x16, custom) get no ID.
 * `taken` lets callers reserve IDs while labelling several new modules at once.
 */
export function nextLabel(project: Project, kind: MilsKind, taken: ReadonlySet<string> = new Set()): string {
  const prefix = PREFIX[kind];
  if (!prefix) return '';
  const all = [...project.modules.map((m) => m.label), ...project.retiredLabels, ...project.storedLabels, ...taken];
  let max = 0;
  let village = 0;
  let dashed = 0;
  for (const label of all) {
    const p = parse(label);
    if (!p) continue;
    if (p.village) village++;
    else dashed++;
    if (p.prefix === prefix) max = Math.max(max, p.n);
  }
  const used = new Set(all.map(norm));
  for (let n = max + 1; ; n++) {
    const num = String(n).padStart(2, '0');
    const label = village > dashed ? `${prefix}${num}-V` : `${prefix}-${num}`;
    if (!used.has(norm(label))) return label;
  }
}

/** Stored plate IDs that are not currently placed in the layout. */
export function storedNotPlaced(project: Project): string[] {
  const placed = new Set(project.modules.map((m) => norm(m.label)));
  return project.storedLabels.filter((l) => !placed.has(norm(l)));
}

/** Returns an error message, or null when the label can be used for this module. */
export function validateLabel(project: Project, moduleId: string, label: string): string | null {
  const key = norm(label);
  if (!key) return null; // unlabelled plates are allowed
  if (project.retiredLabels.some((r) => norm(r) === key)) return `${label.trim()} was retired and can't be reused.`;
  const clash = project.modules.find((m) => m.id !== moduleId && norm(m.label) === key);
  if (clash) return `${label.trim()} is already used by another module.`;
  return null;
}
