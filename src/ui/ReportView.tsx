// Display report page (Phase 7B): read-only, printable.
import { useEffect, useMemo, useState } from 'react';
import { buildReport } from '../domain/report';
import { formatMoney } from '../domain/inventory';
import { overheadSvg } from './overheadSvg';
import { tableSize, summary } from './format';
import type { Project } from '../domain/schema';
import type { ProjectRepository } from '../storage/repository';

export function ReportView({ repo, id, onBack }: { repo: ProjectRepository; id: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    repo.getProject(id).then(setProject, (e: Error) => setError(e.message));
  }, [repo, id]);
  const r = useMemo(() => (project ? buildReport(project) : null), [project]);
  const svg = useMemo(() => (project ? overheadSvg(project, { labels: true }) : ''), [project]);
  if (error) return <p className="banner error" role="alert">{error}</p>;
  if (!project || !r) return null;

  return (
    <div className="print-page report">
      <div className="print-actions no-print">
        <button type="button" onClick={onBack}>
          ← Back to editor
        </button>
        <button type="button" className="primary" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>
      <header className="print-head">
        <h1>{r.name} — display report</h1>
        <p className="muted">
          {summary(r.stats)} · {tableSize(project)}
          {r.levels.length > 1 && ` · levels: ${r.levels.join(', ')}`} · {new Date(r.generatedAt).toLocaleDateString()}
        </p>
      </header>
      <div className="print-plan report-plan" dangerouslySetInnerHTML={{ __html: svg }} />

      {r.attention.length > 0 && (
        <section className="print-section attention">
          <h2>Needs attention ({r.attention.length})</h2>
          <ul>
            {r.attention.map((a) => (
              <li key={a.code}>
                <strong>
                  {a.code} {a.name}
                </strong>{' '}
                — {a.condition.toLowerCase()}
                {a.last && <span className="muted"> · last: {a.last}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="print-section">
        <h2>Shows ({r.shows.length})</h2>
        {r.shows.length === 0 ? (
          <p className="muted">No shows yet.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>Dates</th>
                <th>Show</th>
                <th>Version</th>
                <th>Setup</th>
                <th>Teardown</th>
                <th>Helpers</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {r.shows.map((s) => (
                <tr key={s.name + s.dates}>
                  <td>{s.dates}</td>
                  <td>
                    <strong>{s.name}</strong>
                    {s.venue && <div className="muted small">{s.venue}</div>}
                    {s.leftOut.length > 0 && <div className="muted small">Left out: {s.leftOut.join(', ')}</div>}
                    {!s.done && <div className="muted small">planned</div>}
                  </td>
                  <td>{s.version || '—'}</td>
                  <td>{s.setupTime ?? '—'}</td>
                  <td>{s.teardownTime ?? '—'}</td>
                  <td className="small">{s.helpers.join(', ') || '—'}</td>
                  <td className="small">
                    {s.issues.length === 0
                      ? '—'
                      : s.issues.map((i) => (
                          <div key={i.at + i.text}>
                            {i.text} <span className="muted">({i.who})</span>
                          </div>
                        ))}
                    {s.overrides > 0 && <div className="muted">{s.overrides} step(s) done out of order</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {r.recurring.length > 0 && (
          <>
            <h3>Came up at more than one show</h3>
            <ul>
              {r.recurring.map((x) => (
                <li key={x.name}>
                  <strong>{x.name}</strong> — {x.shows.join(', ')}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {r.builds.length > 0 && (
        <section className="print-section">
          <h2>Physical builds ({r.builds.length})</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Condition</th>
                <th>Stored at</th>
              </tr>
            </thead>
            <tbody>
              {r.builds.map((b) => (
                <tr key={b.code}>
                  <td>{b.code}</td>
                  <td>{b.name}</td>
                  <td>
                    {b.status}
                    {b.status === 'Being built' && ` (${b.progress}%)`}
                  </td>
                  <td>{b.condition}</td>
                  <td>{b.storage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(r.containers.count > 0 || r.spending.total !== 0) && (
        <section className="print-section">
          <h2>Packing and money</h2>
          <ul>
            {r.containers.count > 0 && (
              <li>
                {r.containers.count} container{r.containers.count === 1 ? '' : 's'}
                {r.containers.weightLb !== null && `, about ${r.containers.weightLb} lb in all`}
              </li>
            )}
            {r.spending.total !== 0 && (
              <li>
                Spent {formatMoney(r.spending.total)}
                {r.spending.bySupplier.length > 0 && ` (${r.spending.bySupplier.map((s) => `${s.supplier} ${formatMoney(s.amount)}`).join(', ')})`}
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
