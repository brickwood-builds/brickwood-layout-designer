import { useEffect, useMemo, useState } from 'react';
import { dimensionLength } from '../domain/edits';
import { modulesUnder } from '../domain/objects';
import { MILS_COLORS, isBase, moduleDisplayName, type Project } from '../domain/schema';
import { formatLength } from '../domain/units';
import type { ProjectRepository } from '../storage/repository';
import { exportFileName } from '../domain/exchange';
import { overheadSvg, svgToPng } from './overheadSvg';
import { tableSize } from './format';
import { HelpButton } from '../help/HelpDialog';

/** Printable overhead plan with module and ride lists. Print → "Save as PDF" makes a PDF. */
export function PrintView({ repo, id, onBack }: { repo: ProjectRepository; id: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [levelId, setLevelId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    repo.getProject(id).then(
      (p) => {
        setProject(p);
        setLevelId([...p.levels].sort((a, b) => a.order - b.order)[0]!.id);
      },
      (e: Error) => setError(e.message),
    );
  }, [repo, id]);

  const svg = useMemo(() => (project ? overheadSvg(project, { levelId, labels: true }) : ''), [project, levelId]);
  if (error) return <p className="banner error" role="alert">{error}</p>;
  if (!project) return null;

  const level = project.levels.find((l) => l.id === levelId)!;
  const unit = project.settings.displayUnit === 'studs' ? 'in' : project.settings.displayUnit;
  const pos = (studs: number) => formatLength(studs, unit);
  const modules = project.modules
    .filter((m) => m.levelId === levelId && !isBase(m))
    .sort((a, b) => moduleDisplayName(a).localeCompare(moduleDisplayName(b), undefined, { numeric: true }));
  // Rides and buildings: named bases, plus any older footprint shapes.
  const rides = [...project.modules.filter((m) => m.levelId === levelId && isBase(m)), ...project.objects.filter((o) => o.levelId === levelId && o.type === 'footprint')].sort((a, b) => a.x - b.x);
  const small = project.objects.filter((o) => o.levelId === levelId && o.type !== 'footprint');
  const dims = project.dimensions.filter((d) => d.levelId === levelId);
  const base = exportFileName(project).replace('.brickwood.json', '');

  const download = async (kind: 'svg' | 'png') => {
    const file = overheadSvg(project, { levelId, labels: true, standalone: true, pixelsPerStud: 6 });
    const blob = kind === 'svg' ? new Blob([file], { type: 'image/svg+xml' }) : await svgToPng(file);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="print-page">
      <div className="print-actions no-print">
        <button type="button" onClick={onBack}>← Back to editor</button>
        {project.levels.length > 1 && (
          <select value={levelId} onChange={(e) => setLevelId(e.target.value)} aria-label="Level">
            {project.levels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        <button type="button" className="primary" onClick={() => window.print()}>Print / Save PDF</button>
        <button type="button" onClick={() => download('png')}>Download picture (PNG)</button>
        <button type="button" onClick={() => download('svg')}>Download drawing (SVG)</button>
        <HelpButton context="print" />
      </div>
      <header className="print-head">
        <h1>{project.name}</h1>
        <p className="muted">
          {project.levels.length > 1 ? `${level.name} · ` : ''}
          {tableSize(project)} · {modules.length} modules · {rides.length} features · printed {new Date().toLocaleDateString()}
        </p>
      </header>
      <div className="print-plan" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="legend print-legend">
        <i style={{ background: MILS_COLORS['32x32'] }} /> 32×32 <i style={{ background: MILS_COLORS['16x16'] }} /> 16×16
        <i style={{ background: MILS_COLORS['16x8'] }} /> 16×8 <i style={{ background: MILS_COLORS.custom }} /> custom
        <i style={{ background: '#c05046' }} /> feature · positions measured from the back-left corner of the table
      </p>

      <section className="print-section">
        <h2>Modules</h2>
        <table className="print-table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Size (studs)</th><th>From left</th><th>From back</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.id}>
                <td>{m.label || '—'}</td>
                <td>{m.name}</td>
                <td>{m.rotation % 180 ? `${m.depth}×${m.width}` : `${m.width}×${m.depth}`}</td>
                <td>{pos(m.x)}</td>
                <td>{pos(m.y)}</td>
                <td>{m.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {rides.length > 0 && (
        <section className="print-section">
          <h2>Features (left to right)</h2>
          <table className="print-table">
            <thead>
              <tr><th>Name</th><th>Size</th><th>From left</th><th>Power</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {rides.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{formatLength(r.rotation % 180 ? r.depth : r.width, unit)} × {formatLength(r.rotation % 180 ? r.width : r.depth, unit)}</td>
                  <td>{pos(r.x)}</td>
                  <td>{r.powerVolts ? `${r.powerVolts} V` : ''}</td>
                  <td>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {small.length > 0 && (
        <section className="print-section">
          <h2>Markers, small items & pieces</h2>
          <table className="print-table">
            <thead>
              <tr><th>Item</th><th>On module</th><th>From left</th><th>From back</th></tr>
            </thead>
            <tbody>
              {small.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{modulesUnder(project, o).join(', ') || '—'}</td>
                  <td>{pos(o.x)}</td>
                  <td>{pos(o.y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {dims.length > 0 && (
        <section className="print-section">
          <h2>Dimensions</h2>
          <ul>
            {dims.map((d) => (
              <li key={d.id}>{d.label || 'Dimension'}: {formatLength(dimensionLength(d), unit)} ({+dimensionLength(d).toFixed(1)} studs)</li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small">Brickwood Layout Designer · 1 stud = 8 mm</p>
    </div>
  );
}

