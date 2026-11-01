// Phase 5B: shows — calendar, what goes this time, packing checklist with separate
// packed / loaded / unloaded / back-home ticks, vehicles and trips, and a record when done.
import { useState, type FormEvent } from 'react';
import { useStore } from 'zustand';
import { Modal } from '../ui/Modal';
import { STEP_LABEL, STEPS, addShow, addTrip, assignTrip, dateClashes, deleteShow, finishShow, progress, removeTrip, reopenShow, setCheck, showUnits, toggleOmit, tripLoads, tripOf, updateShow, type ShowEdit } from '../domain/shows';
import { itemName, packables } from '../domain/packing';
import type { Show } from '../domain/schema';
import { checklistHtml, printPage } from '../ui/labels';
import type { EditorStore } from './store';

const today = () => new Date().toISOString().slice(0, 10);
const dates = (s: Show) => (s.start === s.end ? s.start : `${s.start} – ${s.end}`);

export function ShowsButton({ store }: { store: EditorStore }) {
  const next = useStore(store, (s) => [...s.project.shows].filter((x) => !x.done && x.end >= today()).sort((a, b) => a.start.localeCompare(b.start))[0]);
  return (
    <button type="button" className="file-btn" onClick={() => store.getState().set({ showsDialog: 'list' })} title="Shows: what goes, packing checklist, trips">
      Shows{next ? ` (next: ${next.name})` : ''}…
    </button>
  );
}

export function ShowsDialog({ store }: { store: EditorStore }) {
  const open = useStore(store, (s) => s.showsDialog);
  const show = useStore(store, (s) => (s.showsDialog && s.showsDialog !== 'list' ? s.project.shows.find((x) => x.id === s.showsDialog) : undefined));
  if (!open) return null;
  const close = () => store.getState().set({ showsDialog: null });
  if (open === 'list' || !show) return <ShowList store={store} onClose={close} />;
  return <ShowRecord key={show.id} store={store} show={show} onClose={close} />;
}

function ShowList({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const [f, setF] = useState({ name: '', venue: '', start: today(), end: today() });
  const clashes = dateClashes(project);
  const sorted = [...project.shows].sort((a, b) => a.start.localeCompare(b.start));
  const add = (e: FormEvent) => {
    e.preventDefault();
    let id = '';
    store.getState().commit((p) => {
      const r = addShow(p, f);
      id = r.id;
      return r.project;
    });
    store.getState().set({ showsDialog: id });
  };
  return (
    <Modal title="Shows" onClose={onClose} wide>
      <div className="packing">
        <form className="inline-form" onSubmit={add}>
          <input aria-label="Show name" placeholder="Show, e.g. BrickFair Virginia" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input aria-label="Venue" placeholder="Venue" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
          <input type="date" aria-label="Starts" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value, end: f.end < e.target.value ? e.target.value : f.end })} />
          <input type="date" aria-label="Ends" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
          <button type="submit" className="primary" disabled={!f.name.trim()}>
            Add show
          </button>
        </form>
        {clashes.map(([a, b]) => (
          <p key={`${a.id}${b.id}`} className="banner warn small" role="alert">
            {a.name} and {b.name} overlap ({dates(a)} / {dates(b)}) — this display can’t be at both.
          </p>
        ))}
        {sorted.length === 0 ? (
          <p className="muted">No shows yet.</p>
        ) : (
          <table className="print-table packing-table">
            <thead>
              <tr>
                <th>Dates</th>
                <th>Show</th>
                <th>Venue</th>
                <th>Packing</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const units = showUnits(project, s);
                const pr = progress(s, units);
                return (
                  <tr key={s.id} className={s.done ? 'muted' : undefined}>
                    <td>{dates(s)}</td>
                    <td>
                      <button type="button" className="link" onClick={() => store.getState().set({ showsDialog: s.id })}>
                        {s.name}
                      </button>
                      {s.done && ' (done)'}
                    </td>
                    <td>{s.venue || '—'}</td>
                    <td className="small">{s.done ? 'Record kept' : `${pr.packed}/${units.length} packed · ${pr.loaded} loaded`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

function ShowRecord({ store, show: s, onClose }: { store: EditorStore; show: Show; onClose: () => void }) {
  const project = useStore(store, (st) => st.project);
  const commit = store.getState().commit;
  const edit = (change: ShowEdit) => commit((p) => updateShow(p, s.id, change));
  const units = showUnits(project, s);
  const pr = progress(s, units);
  const loads = tripLoads(s, units);
  const offTrip = s.trips.length ? units.filter((u) => !tripOf(s, u.id)) : [];
  const [trip, setTrip] = useState({ name: '', cap: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const clash = dateClashes(project).find(([a, b]) => a.id === s.id || b.id === s.id);

  const text = (label: string, key: 'name' | 'venue' | 'versionName', placeholder?: string) => (
    <label className="field">
      <span>{label}</span>
      <input aria-label={label} placeholder={placeholder} defaultValue={s[key]} key={`${key}-${s[key]}`} disabled={s.done} onBlur={(e) => e.target.value.trim() !== s[key] && (key !== 'name' || e.target.value.trim()) && edit({ [key]: e.target.value.trim() })} />
    </label>
  );

  const printList = () =>
    printPage(
      checklistHtml(
        `${s.name} — packing list (${dates(s)})`,
        [{ heading: project.name, rows: units.map((u) => ({ label: u.label, contents: u.contents, ticks: STEPS.map((st) => !!s.checklist[u.id]?.[st]) })) }],
        STEPS.map((st) => STEP_LABEL[st]),
      ),
    );
  const printLoads = () =>
    printPage(
      checklistHtml(
        `${s.name} — load plan`,
        [
          ...loads.map((l) => ({
            heading: `${l.trip.name}${l.trip.capacityCuFt ? ` — ${l.volume} of ${l.trip.capacityCuFt} cu ft` : ''}`,
            rows: l.units.map((u) => ({ label: u.label, contents: u.contents, ticks: [!!s.checklist[u.id]?.loaded, !!s.checklist[u.id]?.unloaded] })),
          })),
          ...(offTrip.length ? [{ heading: 'Not on a trip yet', rows: offTrip.map((u) => ({ label: u.label, contents: u.contents, ticks: [false, false] })) }] : []),
        ],
        ['Loaded', 'Unloaded'],
      ),
    );

  return (
    <Modal title={s.name} onClose={onClose} wide>
      <div className="build-record">
        <div className="actions">
          <button type="button" className="link" onClick={() => store.getState().set({ showsDialog: 'list' })}>
            ← All shows
          </button>
        </div>
        {clash && (
          <p className="banner warn small" role="alert">
            Overlaps with {clash[0].id === s.id ? clash[1].name : clash[0].name} — this display can’t be at both.
          </p>
        )}
        {s.done && <p className="design-box small">This show is done. Its record below keeps what actually went; later changes to the layout or packing don’t change it.</p>}
        <div className="row">
          {text('Show name', 'name')}
          {text('Venue', 'venue')}
        </div>
        <div className="row">
          <label className="field">
            <span>Starts</span>
            <input type="date" aria-label="Starts" value={s.start} disabled={s.done} onChange={(e) => edit({ start: e.target.value, ...(s.end < e.target.value ? { end: e.target.value } : {}) })} />
          </label>
          <label className="field">
            <span>Ends</span>
            <input type="date" aria-label="Ends" value={s.end} min={s.start} disabled={s.done} onChange={(e) => edit({ end: e.target.value })} />
          </label>
        </div>
        {text('Version going', 'versionName', 'e.g. 2026 show — 12 ft')}
        <label className="field">
          <span>Notes (venue rules, tables provided, travel, costs, contacts)</span>
          <textarea aria-label="Show notes" rows={3} defaultValue={s.notes} key={`notes-${s.notes}`} onBlur={(e) => e.target.value !== s.notes && edit({ notes: e.target.value })} />
        </label>

        {s.done && s.snapshot ? (
          <section>
            <h3>What went ({s.snapshot.at.slice(0, 10)})</h3>
            <ul className="small">
              {s.snapshot.containers.map((c) => (
                <li key={c.code}>
                  <strong>{c.name}</strong>: {c.contents.join(', ')}
                </li>
              ))}
              {s.snapshot.loose.map((l) => (
                <li key={l}>{l} (unboxed)</li>
              ))}
            </ul>
            {s.snapshot.omitted.length > 0 && <p className="small muted">Left out: {s.snapshot.omitted.join(', ')}</p>}
            <div className="actions">
              <button type="button" onClick={() => commit((p) => reopenShow(p, s.id))}>
                Reopen
              </button>
            </div>
          </section>
        ) : (
          <>
            <section>
              <h3>Going this time</h3>
              <p className="muted small">Untick anything staying home this time (or swapped at the last minute). The layout itself isn’t changed.</p>
              <div className="chips pick-chips">
                {packables(project).map((i) => (
                  <label key={i.id} className="check chip">
                    <input type="checkbox" checked={!s.omittedIds.includes(i.id)} onChange={() => commit((p) => toggleOmit(p, s.id, i.id))} />
                    {itemName(i)}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3>
                Checklist — {pr.packed}/{units.length} packed · {pr.loaded} loaded · {pr.unloaded} unloaded · {pr.home} back home
              </h3>
              {units.length === 0 ? (
                <p className="muted small">Nothing to take yet. Pack modules into containers (Packing…), or they’re listed here one by one.</p>
              ) : (
                <div className="parts-table-wrap">
                  <table className="print-table checklist">
                    <thead>
                      <tr>
                        <th>What</th>
                        {STEPS.map((st) => (
                          <th key={st}>{STEP_LABEL[st]}</th>
                        ))}
                        {s.trips.length > 0 && <th>Trip</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.label}</strong>
                            {u.contents.length > 0 && <div className="muted small">{u.contents.join(', ')}</div>}
                          </td>
                          {STEPS.map((st) => (
                            <td key={st}>
                              <input type="checkbox" aria-label={`${STEP_LABEL[st]}: ${u.label}`} checked={!!s.checklist[u.id]?.[st]} onChange={(e) => commit((p) => setCheck(p, s.id, u.id, st, e.target.checked))} />
                            </td>
                          ))}
                          {s.trips.length > 0 && (
                            <td>
                              <select aria-label={`Trip: ${u.label}`} value={tripOf(s, u.id)?.id ?? ''} onChange={(e) => commit((p) => assignTrip(p, s.id, u.id, e.target.value || null))}>
                                <option value="">—</option>
                                {s.trips.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h3>Vehicles and trips</h3>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  commit((p) => addTrip(p, s.id, trip.name, Number(trip.cap) > 0 ? Number(trip.cap) : undefined));
                  setTrip({ name: '', cap: '' });
                }}
              >
                <input aria-label="Trip name" placeholder="e.g. Van — Friday morning" value={trip.name} onChange={(e) => setTrip({ ...trip, name: e.target.value })} />
                <input aria-label="Cargo space (cu ft)" placeholder="Cargo cu ft (optional)" inputMode="decimal" value={trip.cap} onChange={(e) => setTrip({ ...trip, cap: e.target.value })} />
                <button type="submit" disabled={!trip.name.trim()}>
                  Add trip
                </button>
              </form>
              {loads.map((l) => (
                <p key={l.trip.id} className={l.over ? 'small warn-text' : 'small'}>
                  <strong>{l.trip.name}</strong>: {l.units.length} item{l.units.length === 1 ? '' : 's'}
                  {l.trip.capacityCuFt ? `, ${l.volume} of ${l.trip.capacityCuFt} cu ft${l.over ? ' — too much for this trip' : ''}` : l.volume ? `, ${l.volume} cu ft` : ''}
                  {l.unsized > 0 && <span className="muted"> ({l.unsized} without a size)</span>}{' '}
                  <button type="button" className="link" aria-label={`Remove trip ${l.trip.name}`} onClick={() => commit((p) => removeTrip(p, s.id, l.trip.id))}>
                    remove
                  </button>
                </p>
              ))}
              {offTrip.length > 0 && <p className="small warn-text">Not on a trip yet: {offTrip.map((u) => u.label).join(', ')}</p>}
            </section>

            <div className="actions wrap">
              <button type="button" onClick={printList} disabled={!units.length}>
                Print packing list
              </button>
              <button type="button" onClick={printLoads} disabled={!s.trips.length}>
                Print load plan
              </button>
              <button type="button" className="primary" onClick={() => commit((p) => finishShow(p, s.id))} title="Keep a record of what actually went">
                Show done — keep the record
              </button>
            </div>
          </>
        )}
        <div className="actions">
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  commit((p) => deleteShow(p, s.id));
                  store.getState().set({ showsDialog: 'list' });
                }}
              >
                Delete this show
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="link" onClick={() => setConfirmDelete(true)}>
              Delete show…
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
