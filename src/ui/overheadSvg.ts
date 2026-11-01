// Overhead drawing of one level as an SVG string (studs as user units).
// Used for dashboard thumbnails, the print page and picture downloads.
import { footprint, levelBounds } from '../domain/geometry';
import { allItems, dimensionLength, isModule } from '../domain/edits';
import { drawOrder } from '../domain/hit';
import { MILS_COLORS, isBase, moduleDisplayName, type Project } from '../domain/schema';
import { DEFAULT_PLATE_COLOR } from '../domain/legoColors';
import { formatLength } from '../domain/units';

export interface SvgOptions {
  levelId?: string;
  /** Show MILS IDs, ride names and saved dimensions. */
  labels?: boolean;
  /** Embed styles so the file looks right outside the app. */
  standalone?: boolean;
  /** Pixel width/height attributes for standalone files. */
  pixelsPerStud?: number;
  /** Name markers and small items (setup maps). */
  itemLabels?: boolean;
  /** Draw only this area (studs), e.g. one module for a setup map. */
  bounds?: { x: number; y: number; width: number; depth: number };
}

const MARGIN = 4;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => +v.toFixed(3);

/** Font size (studs) that keeps a one-line label inside its rectangle. */
function fitText(text: string, width: number, depth: number, max: number) {
  return Math.min(max, depth * 0.45, (width * 0.9) / Math.max(1, text.length * 0.6));
}

export const STANDALONE_STYLE = `
.pv-table{fill:#d9b27c;stroke:#a67c45;stroke-width:.6}
.pv-module{stroke:rgba(0,0,0,.45);stroke-width:.35}
.pv-footprint{fill-opacity:.85;stroke:#7a2a24;stroke-width:.5}
.pv-item{stroke:rgba(0,0,0,.45);stroke-width:.15}
.pv-label,.pv-name{text-anchor:middle;dominant-baseline:central;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.pv-label{fill:#1b1b1b}
.pv-name{fill:#fff;font-weight:600;paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:.6}
.pv-dim{stroke:#6639ba;stroke-width:.4;stroke-dasharray:1.5 1}
.pv-dim-text{fill:#6639ba;font-family:system-ui,sans-serif;text-anchor:middle}`;

export function overheadSvg(project: Project, opts: SvgOptions = {}): string {
  const level = project.levels.find((l) => l.id === opts.levelId) ?? project.levels.find((l) => l.visible) ?? project.levels[0]!;
  const b = opts.bounds ?? levelBounds(project, level.id) ?? { x: 0, y: 0, width: 64, depth: 32 };
  const vb = { x: b.x - MARGIN, y: b.y - MARGIN, w: b.width + MARGIN * 2, h: b.depth + MARGIN * 2 };
  const visible = new Set(project.layers.filter((l) => l.visible).map((l) => l.id));
  const out: string[] = [];
  const size = opts.pixelsPerStud ? ` width="${Math.round(vb.w * opts.pixelsPerStud)}" height="${Math.round(vb.h * opts.pixelsPerStud)}"` : '';
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}"${size} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Overhead view of ${esc(project.name)}">`);
  if (opts.standalone) out.push(`<style>${STANDALONE_STYLE}</style><rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}" fill="#ffffff"/>`);

  for (const t of project.tables.filter((t) => t.levelId === level.id)) {
    const r = footprint(t);
    out.push(`<rect class="pv-table" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.depth)}" rx="1.5"/>`);
  }
  const items = drawOrder(
    project,
    allItems(project).filter((i) => i.levelId === level.id && visible.has(i.layerId)),
  );
  for (const i of items) {
    const r = footprint(i);
    if (isModule(i)) {
      out.push(`<rect class="pv-module" data-label="${esc(i.label)}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.depth)}" fill="${project.settings.moduleColors === 'plate' && (i.plateColor || !isBase(i)) ? (i.plateColor ?? DEFAULT_PLATE_COLOR) : (i.color ?? MILS_COLORS[i.kind])}"/>`);
      const text = moduleDisplayName(i);
      if (opts.labels && text) out.push(`<text class="pv-label" x="${n(r.x + r.width / 2)}" y="${n(r.y + r.depth / 2)}" font-size="${n(fitText(text, r.width, r.depth, 5))}">${esc(text)}</text>`);
    } else if (i.round) {
      out.push(`<ellipse class="pv-item" cx="${n(r.x + r.width / 2)}" cy="${n(r.y + r.depth / 2)}" rx="${n(r.width / 2)}" ry="${n(r.depth / 2)}" fill="${i.color}"/>`);
    } else {
      out.push(`<rect class="${i.type === 'footprint' ? 'pv-footprint' : 'pv-item'}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.depth)}" fill="${i.color}"/>`);
      if (opts.labels && i.type === 'footprint' && i.name) {
        out.push(`<text class="pv-name" x="${n(r.x + r.width / 2)}" y="${n(r.y + r.depth / 2)}" font-size="${n(fitText(i.name, r.width, r.depth, 6))}">${esc(i.name)}</text>`);
      }
    }
    if (opts.itemLabels && !isModule(i) && (i.type === 'setupMarker' || i.type === 'item') && i.name) {
      out.push(`<text class="pv-name" x="${n(r.x + r.width / 2)}" y="${n(r.y - 0.6)}" font-size="1.6">${esc(i.name)}</text>`);
    }
  }
  if (opts.labels) {
    for (const d of project.dimensions.filter((d) => d.levelId === level.id)) {
      const text = `${d.label ? `${d.label}: ` : ''}${formatLength(dimensionLength(d), project.settings.displayUnit)}`;
      out.push(`<line class="pv-dim" x1="${n(d.x1)}" y1="${n(d.y1)}" x2="${n(d.x2)}" y2="${n(d.y2)}"/>`);
      out.push(`<text class="pv-dim-text" x="${n((d.x1 + d.x2) / 2)}" y="${n((d.y1 + d.y2) / 2 - 1)}" font-size="3">${esc(text)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

/** Render the standalone SVG to a PNG blob (browser only). */
export async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create picture'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
