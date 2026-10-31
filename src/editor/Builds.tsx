// Phase 4A: physical builds — the list, and one build's record (status, condition, storage,
// progress and milestones, photos, setup notes, history; rebuild, take apart, replace).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStore } from 'zustand';
import { Modal } from '../ui/Modal';
import {
  CONDITION_LABEL,
  STATUS_LABEL,
  addHistory,
  addMilestone,
  addPhotoToBuild,
  buildItems,
  deleteBuild,
  dismantle,
  rebuild,
  removeMilestone,
  removePhotoFromBuild,
  replaceBuild,
  toggleMilestone,
  updateBuild,
  type BuildEdit,
} from '../domain/builds';
import { BUILD_CONDITIONS, BUILD_STATUSES, type Build } from '../domain/schema';
import type { PhotoRow } from '../storage/db';
import type { ProjectRepository } from '../storage/repository';
import { showItems } from './actions';
import { preparePhoto } from './photos';
import type { EditorStore } from './store';

/** Status-bar button (when Physical builds is on). */
export function BuildsButton({ store }: { store: EditorStore }) {
  const count = useStore(store, (s) => s.project.builds.filter((b) => b.status !== 'replaced').length);
  return (
    <button type="button" className="file-btn" onClick={() => store.getState().set({ buildDialog: 'list' })} title="Your physical builds: permanent IDs, storage, condition, repairs, photos">
      Builds ({count})…
    </button>
  );
}

/** The builds window, when open. */
export function BuildsDialog({ store, repo }: { store: EditorStore; repo: ProjectRepository }) {
  const open = useStore(store, (s) => s.buildDialog);
  const build = useStore(store, (s) => (s.buildDialog && s.buildDialog !== 'list' ? s.project.builds.find((b) => b.id === s.buildDialog) : undefined));
  if (!open) return null;
  const close = () => store.getState().set({ buildDialog: null });
  if (open === 'list' || !build) return <BuildList store={store} onClose={close} />;
  return <BuildRecord key={build.id} store={store} repo={repo} build={build} onClose={close} />;
}

function BuildList({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const builds = useStore(store, (s) => s.project.builds);
  const [showReplaced, setShowReplaced] = useState(false);
  const shown = builds.filter((b) => showReplaced || b.status !== 'replaced');
  return (
    <Modal title="Physical builds" onClose={onClose} wide>
      <div className="builds">
        <p className="muted small">
          Each real build has a permanent ID that stays through repairs and rebuilds. To add one, select it on the plan (for example the castle and everything on it) and choose “Track as a physical build”.
        </p>
        {builds.some((b) => b.status === 'replaced') && (
          <label className="check">
            <input type="checkbox" checked={showReplaced} onChange={(e) => setShowReplaced(e.target.checked)} />
            Show replaced builds
          </label>
        )}
        {shown.length === 0 ? (
          <p className="muted">No physical builds yet.</p>
        ) : (
          <table className="print-table builds-table">
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
              {shown.map((b) => (
                <tr key={b.id}>
                  <td>
                    <button type="button" className="link" onClick={() => store.getState().set({ buildDialog: b.id })}>
                      {b.code}
                    </button>
                  </td>
                  <td>{b.name}</td>
                  <td>
                    {STATUS_LABEL[b.status]}
                    {b.status === 'building' && ` (${b.progress}%)`}
                  </td>
                  <td className={b.condition === 'good' ? undefined : 'warn-text'}>{CONDITION_LABEL[b.condition]}</td>
                  <td>{b.storage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

/** A text box that saves when you leave it. */
function SavedText({ label, value, onSave, multiline, placeholder }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const props = {
    'aria-label': label,
    value: draft ?? value,
    placeholder,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => {
      if (draft !== null && draft !== value) onSave(draft);
      setDraft(null);
    },
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea rows={3} {...props} /> : <input {...props} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />}
    </label>
  );
}

function BuildRecord({ store, repo, build: b, onClose }: { store: EditorStore; repo: ProjectRepository; build: Build; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const commit = store.getState().commit;
  const edit = (change: BuildEdit) => commit((p) => updateBuild(p, b.id, change));
  const design = b.designId ? project.designs.find((d) => d.id === b.designId) : undefined;
  const onPlan = buildItems(project, b);
  const replacedBy = b.replacedBy ? project.builds.find((x) => x.id === b.replacedBy) : undefined;
  const replaces = b.replaces ? project.builds.find((x) => x.id === b.replaces) : undefined;
  const [action, setAction] = useState<null | 'rebuild' | 'dismantle' | 'replace' | 'delete'>(null);
  const [why, setWhy] = useState('');
  const [partly, setPartly] = useState(true);
  const [entry, setEntry] = useState({ kind: 'note' as 'note' | 'repair', text: '', fixed: true });
  const [milestone, setMilestone] = useState('');
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [bigPhoto, setBigPhoto] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    repo.getPhotos(b.photos).then((rows) => live && setPhotos(rows), () => undefined);
    return () => {
      live = false;
    };
  }, [repo, b.photos]);
  useEffect(() => {
    if (!bigPhoto) return;
    return () => URL.revokeObjectURL(bigPhoto);
  }, [bigPhoto]);

  const addPhotos = async (files: FileList) => {
    setPhotoMsg('');
    for (const f of [...files]) {
      try {
        const { blob, thumb } = await preparePhoto(f);
        const id = await repo.addPhoto(project.id, blob, thumb, f.name);
        commit((p) => addPhotoToBuild(p, b.id, id, ''));
      } catch {
        setPhotoMsg(`Couldn’t read ${f.name} as a photo.`);
      }
    }
  };

  const addEntry = (e: FormEvent) => {
    e.preventDefault();
    if (!entry.text.trim()) return;
    commit((p) => addHistory(p, b.id, entry.kind, entry.text, entry.fixed));
    setEntry({ ...entry, text: '' });
  };

  const doAction = () => {
    if (action === 'rebuild') commit((p) => rebuild(p, b.id, why));
    if (action === 'dismantle') commit((p) => dismantle(p, b.id, partly, why));
    if (action === 'replace') {
      let next = '';
      commit((p) => {
        const r = replaceBuild(p, b.id, why);
        next = r?.buildId ?? '';
        return r?.project ?? p;
      });
      if (next) store.getState().set({ buildDialog: next });
    }
    if (action === 'delete') {
      commit((p) => deleteBuild(p, b.id));
      store.getState().set({ buildDialog: 'list' });
    }
    setAction(null);
    setWhy('');
  };

  return (
    <Modal title={`${b.code} ${b.name}`} onClose={onClose} wide>
      <div className="build-record">
        <div className="actions">
          <button type="button" className="link" onClick={() => store.getState().set({ buildDialog: 'list' })}>
            ← All builds
          </button>
        </div>
        {replacedBy && (
          <p className="design-box outdated small">
            Replaced by{' '}
            <button type="button" className="link" onClick={() => store.getState().set({ buildDialog: replacedBy.id })}>
              {replacedBy.code}
            </button>
            . This record is kept for its history.
          </p>
        )}
        {replaces && (
          <p className="muted small">
            Replaces{' '}
            <button type="button" className="link" onClick={() => store.getState().set({ buildDialog: replaces.id })}>
              {replaces.code}
            </button>
            .
          </p>
        )}
        <div className="row">
          <SavedText label="Name" value={b.name} onSave={(v) => v.trim() && edit({ name: v.trim() })} />
          <label className="field">
            <span>Permanent ID</span>
            <input value={b.code} readOnly aria-label="Permanent ID" />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>Status</span>
            <select aria-label="Status" value={b.status} disabled={b.status === 'replaced'} onChange={(e) => edit({ status: e.target.value as Build['status'] })}>
              {BUILD_STATUSES.filter((s) => s !== 'replaced' || b.status === 'replaced').map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Condition</span>
            <select aria-label="Condition" value={b.condition} onChange={(e) => edit({ condition: e.target.value as Build['condition'] })}>
              {BUILD_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <SavedText label="Stored at" value={b.storage} placeholder="e.g. Garage shelf 3, tote 12" onSave={(v) => edit({ storage: v })} />
        <p className="small">
          {design ? (
            <>
              Built from design <strong>{design.name}</strong> (version {b.designVersion ?? '?'}
              {design.version !== b.designVersion && `; the design is now version ${design.version}`}).{' '}
            </>
          ) : null}
          On the plan: {onPlan.length} thing{onPlan.length === 1 ? '' : 's'}.{' '}
          {onPlan.length > 0 && (
            <button
              type="button"
              className="link"
              onClick={() => {
                onClose();
                showItems(store, onPlan);
              }}
            >
              Show on plan
            </button>
          )}
        </p>

        <section>
          <h3>Build progress: {b.progress}%</h3>
          <progress max={100} value={b.progress} aria-label="Build progress" />
          {b.milestones.length === 0 && (
            <label className="field">
              <span>Progress (%)</span>
              <input type="range" min={0} max={100} step={5} value={b.progress} aria-label="Progress (%)" onChange={(e) => edit({ progress: Number(e.target.value) })} />
            </label>
          )}
          <ul className="milestones">
            {b.milestones.map((m) => (
              <li key={m.id}>
                <label className="check">
                  <input type="checkbox" checked={m.done} onChange={() => commit((p) => toggleMilestone(p, b.id, m.id))} />
                  {m.text}
                  {m.doneAt && <span className="muted small"> — {m.doneAt.slice(0, 10)}</span>}
                </label>
                <button type="button" className="link" aria-label={`Remove milestone ${m.text}`} onClick={() => commit((p) => removeMilestone(p, b.id, m.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              commit((p) => addMilestone(p, b.id, milestone));
              setMilestone('');
            }}
          >
            <input aria-label="New milestone" placeholder="Add a step, e.g. Walls done" value={milestone} onChange={(e) => setMilestone(e.target.value)} />
            <button type="submit" disabled={!milestone.trim()}>
              Add step
            </button>
          </form>
        </section>

        <section>
          <h3>Photos</h3>
          <div className="photo-grid">
            {photos.map((ph) => (
              <figure key={ph.id}>
                <button type="button" className="photo" onClick={() => setBigPhoto(URL.createObjectURL(ph.blob))} aria-label={`Open photo ${ph.caption || ph.createdAt.slice(0, 10)}`}>
                  <img src={ph.thumb} alt={ph.caption || 'Build photo'} />
                </button>
                <figcaption className="muted small">
                  {ph.createdAt.slice(0, 10)}{' '}
                  <button
                    type="button"
                    className="link"
                    aria-label="Remove photo"
                    onClick={() => {
                      commit((p) => removePhotoFromBuild(p, b.id, ph.id));
                      void repo.deletePhoto(ph.id);
                    }}
                  >
                    remove
                  </button>
                </figcaption>
              </figure>
            ))}
            <button type="button" className="add-photo" onClick={() => fileRef.current?.click()}>
              + Add photo
            </button>
          </div>
          {b.photos.length > photos.length && <p className="muted small">{b.photos.length - photos.length} photo(s) were added on another device.</p>}
          {photoMsg && <p className="small warn-text">{photoMsg}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label="Add photo"
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) void addPhotos(files).finally(() => (e.target.value = ''));
            }}
          />
          <p className="muted small">Photos are kept on this device.</p>
        </section>

        <SavedText label="Setup notes for this build" multiline value={b.setupNotes} placeholder="How to set up this copy (e.g. the left tower clips on last)" onSave={(v) => edit({ setupNotes: v })} />
        <SavedText label="How it differs from its design" multiline value={b.notes} placeholder="Substitutions, changes, missing parts…" onSave={(v) => edit({ notes: v })} />

        <section>
          <h3>History</h3>
          <form className="inline-form" onSubmit={addEntry}>
            <select aria-label="Kind of entry" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value as 'note' | 'repair' })}>
              <option value="note">Note</option>
              <option value="repair">Repair</option>
            </select>
            <input aria-label="History entry" placeholder={entry.kind === 'repair' ? 'What was repaired' : 'A note'} value={entry.text} onChange={(e) => setEntry({ ...entry, text: e.target.value })} />
            {entry.kind === 'repair' && b.condition !== 'good' && (
              <label className="check small">
                <input type="checkbox" checked={entry.fixed} onChange={(e) => setEntry({ ...entry, fixed: e.target.checked })} />
                Now in good condition
              </label>
            )}
            <button type="submit" disabled={!entry.text.trim()}>
              Add
            </button>
          </form>
          <ol className="history" reversed>
            {[...b.history].reverse().map((h) => (
              <li key={h.id}>
                <span className="muted small">{h.at.slice(0, 10)}</span> <span className={`kind ${h.kind}`}>{h.kind}</span> {h.text}
              </li>
            ))}
          </ol>
        </section>

        {b.status !== 'replaced' && (
          <section>
            <h3>It changed</h3>
            {action ? (
              <div className="design-box">
                <strong className="small">
                  {action === 'rebuild' && 'Rebuilt — the same build, same ID'}
                  {action === 'dismantle' && 'Taken apart'}
                  {action === 'replace' && 'Replaced by a new, separate build (it gets a new ID)'}
                  {action === 'delete' && 'Stop tracking — only if this was a mistake: the record and its history are removed'}
                </strong>
                {action === 'dismantle' && (
                  <div className="seg" role="group" aria-label="How much">
                    <button type="button" aria-pressed={partly} onClick={() => setPartly(true)}>
                      Partly
                    </button>
                    <button type="button" aria-pressed={!partly} onClick={() => setPartly(false)}>
                      All of it
                    </button>
                  </div>
                )}
                {action !== 'delete' && <input aria-label="Why (optional)" placeholder="Why (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />}
                {action === 'dismantle' && <span className="muted small">Put its parts back in “Have” in the parts list if you keep them loose.</span>}
                <div className="actions">
                  <button type="button" className={action === 'delete' ? 'danger' : 'primary'} onClick={doAction}>
                    {action === 'delete' ? 'Stop tracking' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setAction(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions wrap">
                <button type="button" onClick={() => setAction('rebuild')}>
                  Rebuilt…
                </button>
                <button type="button" onClick={() => setAction('dismantle')}>
                  Taken apart…
                </button>
                <button type="button" onClick={() => setAction('replace')}>
                  Replaced by a new build…
                </button>
                <button type="button" className="link" onClick={() => setAction('delete')}>
                  Stop tracking
                </button>
              </div>
            )}
          </section>
        )}
      </div>
      {bigPhoto && (
        <Modal title="Photo" onClose={() => setBigPhoto(null)} wide>
          <img className="photo-big" src={bigPhoto} alt="Build photo" />
        </Modal>
      )}
    </Modal>
  );
}
