// Printable box labels and packing lists (Phase 5). A label's QR code only opens the box's
// details in the app (lookup); it never ticks anything off.
import qrcode from 'qrcode-generator';
import { KIND_LABEL, contentsOf, totalWeight } from '../domain/packing';
import type { Container, Project } from '../domain/schema';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The address a label's QR code opens: this app, the project, the box. */
export function boxUrl(projectId: string, code: string, base = `${window.location.origin}${window.location.pathname}`): string {
  return `${base}#/project/${projectId}/box/${encodeURIComponent(code)}`;
}

export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

const PAGE_STYLE = `
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 12mm; color: #111; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .labels { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
  .label { border: 2px solid #111; border-radius: 6px; padding: 4mm; display: grid; grid-template-columns: 1fr 32mm; gap: 3mm; break-inside: avoid; }
  .code { font-size: 28px; font-weight: 800; letter-spacing: 1px; }
  .name { font-size: 15px; font-weight: 600; }
  .meta { font-size: 11px; color: #444; }
  .handle { font-size: 12px; font-weight: 700; color: #b00; margin-top: 2mm; }
  ul { margin: 2mm 0 0; padding-left: 4mm; font-size: 11px; }
  .qr svg { width: 32mm; height: 32mm; }
  .qr small { display: block; font-size: 8px; text-align: center; color: #555; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #999; padding: 3px 6px; text-align: left; vertical-align: top; }
  .box { width: 14px; height: 14px; border: 1.5px solid #111; display: inline-block; }
  @media print { body { margin: 8mm; } }
`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_STYLE}</style></head><body>${body}</body></html>`;
}

function size(c: Container): string {
  return c.widthIn && c.depthIn && c.heightIn ? `${c.widthIn}×${c.depthIn}×${c.heightIn} in` : '';
}

/** One label per container: ID, name, contents, handling notes, QR lookup. */
export function labelsHtml(p: Project, containers: Container[], base?: string): string {
  const labels = containers
    .map((c) => {
      const w = totalWeight(p, c);
      const meta = [KIND_LABEL[c.kind], size(c), w !== null ? `${w} lb` : '', p.name].filter(Boolean).join(' · ');
      const items = contentsOf(p, c);
      return `<div class="label"><div><div class="code">${esc(c.code)}</div><div class="name">${esc(c.name || KIND_LABEL[c.kind])}</div><div class="meta">${esc(meta)}</div>${
        c.handling ? `<div class="handle">⚠ ${esc(c.handling)}</div>` : ''
      }<ul>${items
        .slice(0, 14)
        .map((t) => `<li>${esc(t)}</li>`)
        .join('')}${items.length > 14 ? `<li>…and ${items.length - 14} more</li>` : ''}</ul></div><div class="qr">${qrSvg(boxUrl(p.id, c.code, base))}<small>Scan to look up</small></div></div>`;
    })
    .join('');
  return page(`Box labels — ${p.name}`, `<h1>Box labels — ${esc(p.name)}</h1><div class="labels">${labels}</div>`);
}

/** A printable checklist page (packing list, load plan). Rows: label, contents, columns to tick. */
export function checklistHtml(title: string, sections: { heading: string; rows: { label: string; contents: string[]; ticks: boolean[] }[] }[], columns: string[]): string {
  const body = sections
    .map(
      (s) =>
        `<h2 style="font-size:15px;margin:14px 0 6px">${esc(s.heading)}</h2><table><thead><tr><th>What</th><th>Contents</th>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.rows
          .map((r) => `<tr><td><strong>${esc(r.label)}</strong></td><td>${esc(r.contents.join(', '))}</td>${r.ticks.map((t) => `<td>${t ? '✔' : '<span class="box"></span>'}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
    )
    .join('');
  return page(title, `<h1>${esc(title)}</h1>${body}`);
}

/** Open a printable page in a new tab and bring up the print dialog. */
export function printPage(html: string) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    w.focus();
    w.print();
  };
  w.addEventListener('load', go);
  setTimeout(go, 400);
  return true;
}
