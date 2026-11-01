// Phase 4B: named versions of a layout — save, choose the preferred one, compare (pictures,
// what changed, part differences), open one as a new project, or go back to it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { Modal } from '../ui/Modal';
import { overheadSvg } from '../ui/overheadSvg';
import { compareProjects, isSame, type Comparison } from '../domain/compare';
import { allItems } from '../domain/edits';
import { footprint } from '../domain/geometry';
import { duplicateProject } from '../domain/project';
import { exportProject } from '../domain/exchange';
import { rebrickableCsv, type ShoppingRow } from '../domain/inventory';
import { loadLibrary } from '../domain/partsLibrary';
import type { Project } from '../domain/schema';
import type { ProjectRepository, VersionInfo } from '../storage/repository';
import type { Autosave } from './autosave';
import type { EditorStore } from './store';

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const safe = (s: string) => s.replace(/[^\w -]+/g, '').trim() || 'version';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function VersionsButton({ store, repo, autosave }: { store: EditorStore; repo: ProjectRepository; autosave: Autosave }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="file-btn" onClick={() => setOpen(true)} title="Save named versions of this layout, compare them, see which parts changed">
        Versions…
      </button>
      {open && <VersionsDialog store={store} repo={repo} autosave={autosave} onClose={() => setOpen(false)} />}
    </>
  );
}

const NOW = 'now';

function VersionsDialog({ store, repo, autosave, onClose }: { store: EditorStore; repo: ProjectRepository; autosave: Autosave; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [compare, setCompare] = useState<{ a: string; b: string } | null>(null);
  const [confirm, setConfirm] = useState<VersionInfo | null>(null);

  const refresh = useCallback(() => repo.listVersions(project.id).then(setVersions, () => setVersions([])), [repo, project.id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    const v = await repo.saveVersion(store.getState().project, name || `Version of ${new Date().toLocaleDateString()}`, note);
    setName('');
    setNote('');
    setMessage(`Saved “${v.name}”.`);
    await refresh();
  };

  const run = async (f: () => Promise<string | void>) => {
    try {
      const m = await f();
      if (m) setMessage(m);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  if (compare && versions) return <CompareView store={store} repo={repo} versions={versions} initial={compare} onBack={() => setCompare(null)} onClose={onClose} />;

  return (
    <Modal title="Versions" onClose={onClose} wide>
      <div className="versions">
        <p className="muted small">
          A version is a saved copy of this layout as it is now — for example “2025 show, 16 ft” before cutting it down to 12 ft. Keep working; you can compare with it, open it as its own project, or go back to it any time.
        </p>
        <div className="inline-form">
          <input aria-label="Version name" placeholder="Name, e.g. 2026 show — 12 ft" value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="Version note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="primary" onClick={() => void save()}>
            Save this as a version
          </button>
        </div>
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
        {!versions ? (
          <p className="muted">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="muted">No versions yet.</p>
        ) : (
          <ul className="version-list">
            {versions.map((v) => {
              const preferred = project.preferredVersion?.id === v.id;
              return (
                <li key={v.id} className={preferred ? 'preferred' : undefined}>
                  <div>
                    <strong>{v.name}</strong> {preferred && <span className="badge">★ Preferred</span>}
                    <br />
                    <span className="muted small">
                      {when(v.createdAt)}
                      {v.note && ` — ${v.note}`}
                    </span>
                  </div>
                  <div className="actions wrap">
                    <button type="button" onClick={() => setCompare({ a: v.id, b: NOW })}>
                      Compare with now
                    </button>
                    <button
                      type="button"
                      aria-pressed={preferred}
                      title="Mark the version to use (e.g. for the next show). Other versions are kept."
                      onClick={() => store.getState().commit((p) => ({ ...p, preferredVersion: preferred ? undefined : { id: v.id, name: v.name } }))}
                    >
                      {preferred ? 'Preferred ★' : 'Make preferred'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          const doc = await repo.getVersion(v.id);
                          const copy = duplicateProject({ ...doc, preferredVersion: undefined }, `${project.name} — ${v.name}`);
                          await repo.createProject(copy);
                          return `Made a new project “${copy.name}”. Find it under Projects.`;
                        })
                      }
                      title="A separate project starting from this version (a branch)"
                    >
                      Open as a new project
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void run(async () => {
                          const doc = await repo.getVersion(v.id);
                          download(`${safe(project.name)} - ${safe(v.name)}.brickwood.json`, exportProject(doc), 'application/json');
                        })
                      }
                    >
                      Download
                    </button>
                    <button type="button" onClick={() => setConfirm(v)}>
                      Go back to this…
                    </button>
                    <button
                      type="button"
                      className="link danger"
                      aria-label={`Delete version ${v.name}`}
                      onClick={() =>
                        void run(async () => {
                          await repo.deleteVersion(v.id);
                          if (preferred) store.getState().commit((p) => ({ ...p, preferredVersion: undefined }));
                          await refresh();
                          return `Deleted “${v.name}”.`;
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {versions && versions.length > 1 && (
          <div className="actions">
            <button type="button" onClick={() => setCompare({ a: versions[1]!.id, b: versions[0]!.id })}>
              Compare two versions…
            </button>
          </div>
        )}
        <p className="muted small">Versions are kept on this device. Download one to keep it as a file.</p>
      </div>
      {confirm && (
        <Modal title="Go back to this version?" onClose={() => setConfirm(null)}>
          <p>
            The layout will be put back to <strong>{confirm.name}</strong>. What you have now is kept as a recovery checkpoint (Projects → Checkpoints…), so you can come back to it. Tip: save it as a version first.
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() =>
                void run(async () => {
                  const doc = await repo.getVersion(confirm.id);
                  await autosave.flush();
                  const current = store.getState().project;
                  await repo.replaceWithVersion({ ...doc, id: current.id, name: current.name, preferredVersion: current.preferredVersion }, `Before going back to “${confirm.name}”`);
                  window.location.reload();
                })
              }
            >
              Go back to this version
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function CompareView({
  store,
  repo,
  versions,
  initial,
  onBack,
  onClose,
}: {
  store: EditorStore;
  repo: ProjectRepository;
  versions: VersionInfo[];
  initial: { a: string; b: string };
  onBack: () => void;
  onClose: () => void;
}) {
  const now = useStore(store, (s) => s.project);
  const [sel, setSel] = useState(initial);
  const [docs, setDocs] = useState<Record<string, Project>>({});
  const [levelIdx, setLevelIdx] = useState(0);

  useEffect(() => {
    let live = true;
    for (const id of [sel.a, sel.b]) {
      if (id === NOW || docs[id]) continue;
      repo.getVersion(id).then((d) => live && setDocs((x) => ({ ...x, [id]: d })), () => undefined);
    }
    return () => {
      live = false;
    };
  }, [sel, docs, repo]);

  const get = (id: string) => (id === NOW ? now : docs[id]);
  const label = (id: string) => (id === NOW ? 'Now' : (versions.find((v) => v.id === id)?.name ?? 'Version'));
  const a = get(sel.a);
  const b = get(sel.b);
  const cmp = useMemo(() => (a && b ? compareProjects(a, b) : null), [a, b]);
  const levels = b?.levels ?? [];
  const level = levels[Math.min(levelIdx, levels.length - 1)];

  const options = [{ id: NOW, name: 'Now (current layout)' }, ...versions.map((v) => ({ id: v.id, name: `${v.name} — ${when(v.createdAt)}` }))];

  return (
    <Modal title="Compare versions" onClose={onClose} wide>
      <div className="compare">
        <div className="actions">
          <button type="button" className="link" onClick={onBack}>
            ← Versions
          </button>
        </div>
        <div className="row">
          {(['a', 'b'] as const).map((k) => (
            <label key={k} className="field">
              <span>{k === 'a' ? 'Before' : 'After'}</span>
              <select aria-label={k === 'a' ? 'Before' : 'After'} value={sel[k]} onChange={(e) => setSel({ ...sel, [k]: e.target.value })}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {levels.length > 1 && (
          <div className="seg" role="group" aria-label="Level">
            {levels.map((l, i) => (
              <button key={l.id} type="button" aria-pressed={i === levelIdx} onClick={() => setLevelIdx(i)}>
                {l.name}
              </button>
            ))}
          </div>
        )}
        {!a || !b || !cmp ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="compare-pics">
              {[sel.a, sel.b].map((id, i) => {
                const doc = i === 0 ? a : b;
                const lv = doc.levels.find((l) => l.id === level?.id) ?? doc.levels[0]!;
                return (
                  <figure key={i}>
                    <figcaption className="small">
                      <strong>{i === 0 ? 'Before' : 'After'}:</strong> {label(id)}{' '}
                      <span className="muted">{i === 0 ? '— red: removed, blue: moved' : '— green: added, blue: moved, orange: changed'}</span>
                    </figcaption>
                    <div className="compare-svg" dangerouslySetInnerHTML={{ __html: withMarks(overheadSvg(doc, { levelId: lv.id, labels: true }), marksFor(cmp, doc, lv.id, i === 0 ? 'before' : 'after')) }} />
                  </figure>
                );
              })}
            </div>
            {isSame(cmp) && !cmp.parts.length ? (
              <p>No differences.</p>
            ) : (
              <div className="compare-lists">
                <ChangeList title="Added" items={cmp.added.map((c) => c.name)} extra={cmp.piecesAdded.map((p) => `${p.count} × ${p.name}`)} />
                <ChangeList title="Removed" items={cmp.removed.map((c) => c.name)} extra={cmp.piecesRemoved.map((p) => `${p.count} × ${p.name}`)} />
                <ChangeList title="Moved or turned" items={cmp.moved.map((c) => `${c.name} (${c.what.join(', ')})`)} extra={cmp.piecesMoved ? [`${cmp.piecesMoved} single pieces`] : []} />
                <ChangeList title="Changed" items={cmp.changed.map((c) => `${c.name}: ${c.what.join(', ')}`)} />
                {(cmp.levelsAdded.length > 0 || cmp.levelsRemoved.length > 0) && <ChangeList title="Levels" items={[...cmp.levelsAdded.map((n) => `+ ${n}`), ...cmp.levelsRemoved.map((n) => `− ${n}`)]} />}
              </div>
            )}
            {cmp.parts.length > 0 && (
              <section>
                <h3>Parts difference</h3>
                <table className="print-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Colour</th>
                      <th>Before</th>
                      <th>After</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cmp.parts.map((p) => (
                      <tr key={`${p.partNo}|${p.colorName}`}>
                        <td>
                          {p.name} <span className="muted">{p.partNo}</span>
                        </td>
                        <td>
                          <i className="swatch" style={{ background: p.color }} /> {p.colorName}
                        </td>
                        <td>{p.before}</td>
                        <td>{p.after}</td>
                        <td className={p.change > 0 ? 'more' : 'less'}>{p.change > 0 ? `+${p.change}` : p.change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cmp.parts.some((p) => p.change > 0) && (
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() =>
                        void loadLibrary().then((lib) => {
                          const rows = cmp.parts.filter((p) => p.change > 0).map((p) => ({ ...p, needed: p.change, toBuy: p.change }) as unknown as ShoppingRow);
                          download(`${safe(now.name)} - extra parts for ${safe(label(sel.b))}.csv`, rebrickableCsv(rows, lib.colorIds).csv, 'text/csv');
                        })
                      }
                      title="Only the extra parts the After version needs (Rebrickable format)"
                    >
                      Download extra parts needed
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

type Mark = { r: { x: number; y: number; width: number; depth: number }; color: string };

/** Outlines for what changed, drawn over a version's picture. */
function marksFor(cmp: Comparison, doc: Project, levelId: string, side: 'before' | 'after'): Mark[] {
  const items = new Map(allItems(doc).filter((i) => i.levelId === levelId).map((i) => [i.id, i]));
  const marks: Mark[] = [];
  const add = (ids: Iterable<string>, color: string) => {
    for (const id of ids) {
      const i = items.get(id);
      if (i && marks.length < 3000) marks.push({ r: footprint(i), color });
    }
  };
  if (side === 'before') {
    add(cmp.removedIds, '#d1242f');
    add(cmp.movedIds, '#1f6feb');
  } else {
    add(cmp.addedIds, '#16a34a');
    add(cmp.movedIds, '#1f6feb');
    add(cmp.changed.map((c) => c.item.id), '#d97706');
  }
  return marks;
}

function withMarks(svg: string, marks: Mark[]): string {
  if (!marks.length) return svg;
  const rects = marks
    .map(({ r, color }) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.depth}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="0.8"/>`)
    .join('');
  return svg.replace(/<\/svg>\s*$/, `${rects}</svg>`);
}

function ChangeList({ title, items, extra = [] }: { title: string; items: string[]; extra?: string[] }) {
  const all = [...items, ...extra];
  if (!all.length) return null;
  return (
    <section>
      <h3>
        {title} ({all.length})
      </h3>
      <ul className="small">
        {all.slice(0, 30).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
        {all.length > 30 && <li className="muted">…and {all.length - 30} more</li>}
      </ul>
    </section>
  );
}
