// Phase 5A: packing — containers (list and one container), what's in them, labels.
import { useState, type FormEvent } from 'react';
import { useStore } from 'zustand';
import { Modal } from '../ui/Modal';
import {
  KIND_LABEL,
  activeContainers,
  addContainer,
  addContainerNote,
  addEquipment,
  containerLabel,
  containerOf,
  contentsOf,
  itemName,
  nestedIn,
  outerContainers,
  packItems,
  removeEquipment,
  retireContainer,
  setParent,
  totalWeight,
  unpackItems,
  unpacked,
  updateContainer,
  volumeCuFt,
  type ContainerEdit,
} from '../domain/packing';
import { findItem, isModule, type Item } from '../domain/edits';
import { CONTAINER_KINDS, type Container } from '../domain/schema';
import { labelsHtml, printPage } from '../ui/labels';
import { showItems } from './actions';
import type { EditorStore } from './store';

export function PackingButton({ store }: { store: EditorStore }) {
  const left = useStore(store, (s) => unpacked(s.project).length);
  return (
    <button type="button" className="file-btn" onClick={() => store.getState().set({ packingDialog: 'list' })} title="Boxes, totes and boards: what's in each, labels with QR codes">
      Packing{left ? ` (${left} to pack)` : ''}…
    </button>
  );
}

export function PackingDialog({ store }: { store: EditorStore }) {
  const open = useStore(store, (s) => s.packingDialog);
  const c = useStore(store, (s) => (s.packingDialog && s.packingDialog !== 'list' ? s.project.containers.find((x) => x.id === s.packingDialog) : undefined));
  if (!open) return null;
  const close = () => store.getState().set({ packingDialog: null });
  if (open === 'list' || !c) return <ContainerList store={store} onClose={close} />;
  return <ContainerRecord key={c.id} store={store} c={c} onClose={close} />;
}

const num = (v: string) => (v.trim() === '' ? undefined : Number(v) > 0 ? Number(v) : undefined);

function NewContainerForm({ store, parentId, onAdded }: { store: EditorStore; parentId?: string; onAdded?: (id: string) => void }) {
  const [f, setF] = useState({ kind: 'tote' as Container['kind'], name: '', w: '', d: '', h: '' });
  const add = (e: FormEvent) => {
    e.preventDefault();
    let id = '';
    store.getState().commit((p) => {
      const r = addContainer(p, { kind: f.kind, name: f.name, widthIn: num(f.w), depthIn: num(f.d), heightIn: num(f.h), parentId });
      id = r.id;
      return r.project;
    });
    setF({ ...f, name: '' });
    onAdded?.(id);
  };
  return (
    <form className="inline-form new-container" onSubmit={add}>
      <select aria-label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Container['kind'] })}>
        {CONTAINER_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <input aria-label="Container name" placeholder="Name, e.g. Modules A–F" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input aria-label="Width (in)" placeholder="W in" inputMode="decimal" className="small-num" value={f.w} onChange={(e) => setF({ ...f, w: e.target.value })} />
      <input aria-label="Depth (in)" placeholder="D in" inputMode="decimal" className="small-num" value={f.d} onChange={(e) => setF({ ...f, d: e.target.value })} />
      <input aria-label="Height (in)" placeholder="H in" inputMode="decimal" className="small-num" value={f.h} onChange={(e) => setF({ ...f, h: e.target.value })} />
      <button type="submit" className="primary">
        Add container
      </button>
    </form>
  );
}

function ContainerList({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const [levelId, setLevelId] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const left = unpacked(project, levelId || undefined);
  const open = (id: string) => store.getState().set({ packingDialog: id });

  const row = (c: Container, depth: number) => {
    const w = totalWeight(project, c);
    return (
      <tr key={c.id}>
        <td style={{ paddingLeft: 6 + depth * 16 }}>
          <button type="button" className="link" onClick={() => open(c.id)}>
            {c.code}
          </button>
        </td>
        <td>
          {c.name || KIND_LABEL[c.kind]} <span className="muted small">{KIND_LABEL[c.kind]}</span>
        </td>
        <td className="small">{contentsOf(project, c).join(', ') || <span className="muted">empty</span>}</td>
        <td className="small">{[c.storage, w !== null ? `${w} lb` : ''].filter(Boolean).join(' · ') || '—'}</td>
      </tr>
    );
  };
  const tree = (cs: Container[], depth: number): React.ReactNode[] => cs.flatMap((c) => [row(c, depth), ...tree(activeContainers(project).filter((x) => x.parentId === c.id), depth + 1)]);

  return (
    <Modal title="Packing" onClose={onClose} wide>
      <div className="packing">
        <p className="muted small">Boxes, totes, crates and carrying boards, each with a permanent ID (never reused). Put modules and features in them here, or select them on the plan and use “Put in”.</p>
        <NewContainerForm store={store} onAdded={open} />
        {activeContainers(project).length > 0 && (
          <table className="print-table packing-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Contents</th>
                <th>Stored · weight</th>
              </tr>
            </thead>
            <tbody>{tree(outerContainers(project), 0)}</tbody>
          </table>
        )}
        {project.containers.some((c) => c.retired) && (
          <label className="check small">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
            Show retired containers (their IDs stay reserved)
          </label>
        )}
        {showRetired && (
          <ul className="small">
            {project.containers
              .filter((c) => c.retired)
              .map((c) => (
                <li key={c.id}>
                  <button type="button" className="link" onClick={() => open(c.id)}>
                    {c.code}
                  </button>{' '}
                  {c.name} — retired
                </li>
              ))}
          </ul>
        )}
        <section>
          <h3>
            Not packed yet ({left.length}){' '}
            {project.levels.length > 1 && (
              <select aria-label="Level" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
                <option value="">All levels</option>
                {project.levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </h3>
          <p className="small">{left.length ? left.map(itemName).join(', ') : 'Everything is packed.'}</p>
        </section>
        <div className="actions">
          <button type="button" disabled={!activeContainers(project).length} onClick={() => printPage(labelsHtml(project, activeContainers(project)))}>
            Print all labels
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ContainerRecord({ store, c, onClose }: { store: EditorStore; c: Container; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const commit = store.getState().commit;
  const edit = (change: ContainerEdit) => commit((p) => updateContainer(p, c.id, change));
  const [pick, setPick] = useState<string[]>([]);
  const [levelId, setLevelId] = useState('');
  const [eq, setEq] = useState({ name: '', qty: '1' });
  const [noteText, setNoteText] = useState('');
  const [retiring, setRetiring] = useState(false);
  const [why, setWhy] = useState('');
  const items = c.itemIds.map((id) => findItem(project, id)).filter((i): i is Item => !!i);
  const candidates = unpacked(project, levelId || undefined);
  const parents = activeContainers(project).filter((x) => x.id !== c.id && !nestedIn(project, c.id).some((n) => n.id === x.id));
  const w = totalWeight(project, c);
  const v = volumeCuFt(c);
  const field = (label: string, key: 'widthIn' | 'depthIn' | 'heightIn' | 'weightLb') => (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        defaultValue={c[key] ?? ''}
        key={`${key}-${c[key] ?? ''}`}
        disabled={c.retired}
        onBlur={(e) => {
          const n = e.target.value.trim() === '' ? undefined : Number(e.target.value);
          if (n === undefined || (Number.isFinite(n) && n >= 0)) if (n !== c[key]) edit({ [key]: n });
        }}
      />
    </label>
  );

  return (
    <Modal title={containerLabel(c)} onClose={onClose} wide>
      <div className="build-record">
        <div className="actions">
          <button type="button" className="link" onClick={() => store.getState().set({ packingDialog: 'list' })}>
            ← All containers
          </button>
        </div>
        {c.retired && <p className="design-box outdated small">Retired — its ID {c.code} stays reserved and its history is kept.</p>}
        <div className="row">
          <label className="field">
            <span>Name</span>
            <input aria-label="Name" defaultValue={c.name} key={`n-${c.name}`} disabled={c.retired} onBlur={(e) => e.target.value.trim() !== c.name && edit({ name: e.target.value.trim() })} />
          </label>
          <label className="field">
            <span>Kind</span>
            <select aria-label="Kind" value={c.kind} disabled={c.retired} onChange={(e) => edit({ kind: e.target.value as Container['kind'] })}>
              {CONTAINER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row four">
          {field('Width (in)', 'widthIn')}
          {field('Depth (in)', 'depthIn')}
          {field('Height (in)', 'heightIn')}
          {field('Weight (lb)', 'weightLb')}
        </div>
        <p className="muted small">
          {v !== null && `${Math.round(v * 10) / 10} cu ft. `}
          {w !== null && nestedIn(project, c.id).length > 0 && `${w} lb with what's inside it.`}
        </p>
        <div className="row">
          <label className="field">
            <span>Stored at</span>
            <input aria-label="Stored at" placeholder="e.g. Garage shelf 3" defaultValue={c.storage} key={`s-${c.storage}`} disabled={c.retired} onBlur={(e) => e.target.value.trim() !== c.storage && edit({ storage: e.target.value })} />
          </label>
          <label className="field">
            <span>Inside</span>
            <select aria-label="Inside" value={c.parentId ?? ''} disabled={c.retired} onChange={(e) => commit((p) => setParent(p, c.id, e.target.value || null))}>
              <option value="">— not inside another container —</option>
              {parents.map((x) => (
                <option key={x.id} value={x.id}>
                  {containerLabel(x)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Handling notes (printed on the label)</span>
          <input aria-label="Handling notes" placeholder="e.g. This side up — fragile towers" defaultValue={c.handling} key={`h-${c.handling}`} disabled={c.retired} onBlur={(e) => e.target.value.trim() !== c.handling && edit({ handling: e.target.value.trim() })} />
        </label>

        {!c.retired && (
          <section>
            <h3>In it ({items.length + c.equipment.length})</h3>
            <ul className="contents-list">
              {items.map((i) => (
                <li key={i.id}>
                  {itemName(i)} {isModule(i) && i.name && i.label ? <span className="muted small">{i.name}</span> : null}
                  <span className="actions-inline">
                    <button type="button" className="link" onClick={() => (onClose(), showItems(store, [i.id]))}>
                      show
                    </button>
                    <button type="button" className="link" aria-label={`Take ${itemName(i)} out`} onClick={() => commit((p) => unpackItems(p, [i.id]))}>
                      take out
                    </button>
                  </span>
                </li>
              ))}
              {c.equipment.map((e) => (
                <li key={e.id}>
                  {e.qty > 1 ? `${e.qty} × ` : ''}
                  {e.name} <span className="muted small">equipment</span>
                  <button type="button" className="link" aria-label={`Remove ${e.name}`} onClick={() => commit((p) => removeEquipment(p, c.id, e.id))}>
                    remove
                  </button>
                </li>
              ))}
              {activeContainers(project)
                .filter((x) => x.parentId === c.id)
                .map((x) => (
                  <li key={x.id}>
                    <button type="button" className="link" onClick={() => store.getState().set({ packingDialog: x.id })}>
                      {containerLabel(x)}
                    </button>{' '}
                    <span className="muted small">container inside</span>
                  </li>
                ))}
            </ul>
            <div className="pick">
              <div className="inline-form">
                <span className="small">Add from the plan:</span>
                {project.levels.length > 1 && (
                  <select aria-label="Level" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
                    <option value="">All levels</option>
                    {project.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {candidates.length === 0 ? (
                <span className="muted small">Everything is packed.</span>
              ) : (
                <div className="chips pick-chips">
                  {candidates.map((i) => (
                    <label key={i.id} className="check chip">
                      <input type="checkbox" checked={pick.includes(i.id)} onChange={(e) => setPick(e.target.checked ? [...pick, i.id] : pick.filter((x) => x !== i.id))} />
                      {itemName(i)}
                    </label>
                  ))}
                </div>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!pick.length}
                  onClick={() => {
                    commit((p) => packItems(p, c.id, pick));
                    setPick([]);
                  }}
                >
                  Put {pick.length || ''} in {c.code}
                </button>
              </div>
            </div>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                commit((p) => addEquipment(p, c.id, eq.name, Number(eq.qty) || 1));
                setEq({ name: '', qty: '1' });
              }}
            >
              <input aria-label="Equipment" placeholder="Equipment, e.g. Folding table, Shelf bracket, Power strip" value={eq.name} onChange={(e) => setEq({ ...eq, name: e.target.value })} />
              <input aria-label="Quantity" inputMode="numeric" className="small-num" value={eq.qty} onChange={(e) => setEq({ ...eq, qty: e.target.value })} />
              <button type="submit" disabled={!eq.name.trim()}>
                Add equipment
              </button>
            </form>
            <details>
              <summary className="small">Add a container inside this one</summary>
              <NewContainerForm store={store} parentId={c.id} />
            </details>
          </section>
        )}

        <section>
          <h3>History</h3>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              commit((p) => addContainerNote(p, c.id, noteText));
              setNoteText('');
            }}
          >
            <input aria-label="Note" placeholder="A note, e.g. Lid cracked; taken to BrickFair" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <button type="submit" disabled={!noteText.trim()}>
              Add note
            </button>
          </form>
          <ol className="history" reversed>
            {[...c.history].reverse().map((h) => (
              <li key={h.id}>
                <span className="muted small">{h.at.slice(0, 10)}</span> {h.text}
              </li>
            ))}
          </ol>
        </section>

        <div className="actions wrap">
          <button type="button" onClick={() => printPage(labelsHtml(project, [c]))}>
            Print label
          </button>
          {!c.retired &&
            (retiring ? (
              <span className="inline-form">
                <input aria-label="Why retired" placeholder="Why (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    commit((p) => retireContainer(p, c.id, why));
                    setRetiring(false);
                  }}
                >
                  Retire {c.code}
                </button>
                <button type="button" onClick={() => setRetiring(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="link" onClick={() => setRetiring(true)}>
                Retire…
              </button>
            ))}
        </div>
      </div>
    </Modal>
  );
}

/** Selection panel: which container the selected things are in, or put them in one. */
export function PackBox({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  if (!project.features.transport) return null;
  const things = selection.map((id) => findItem(project, id)).filter((i): i is Item => !!i && (isModule(i) || i.type === 'footprint'));
  if (!things.length) return null;
  const inside = [...new Set(things.map((i) => containerOf(project, i.id)).filter((c): c is Container => !!c))];
  return (
    <div className="design-box build-box">
      {inside.length > 0 && (
        <span className="small">
          Packed in{' '}
          {inside.map((c, n) => (
            <span key={c.id}>
              {n > 0 && ', '}
              <button type="button" className="link" onClick={() => store.getState().set({ packingDialog: c.id })}>
                {containerLabel(c)}
              </button>
            </span>
          ))}
        </span>
      )}
      <label className="field">
        <span>{inside.length ? 'Move to' : 'Put in'}</span>
        <select
          aria-label="Put in"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (v === 'new') {
              let id = '';
              store.getState().commit((p) => {
                const r = addContainer(p, { kind: 'tote' });
                id = r.id;
                return packItems(r.project, r.id, things.map((i) => i.id));
              });
              store.getState().set({ packingDialog: id });
            } else if (v === 'out') store.getState().commit((p) => unpackItems(p, things.map((i) => i.id)));
            else store.getState().commit((p) => packItems(p, v, things.map((i) => i.id)));
          }}
        >
          <option value="">Choose a container…</option>
          {activeContainers(project).map((c) => (
            <option key={c.id} value={c.id}>
              {containerLabel(c)}
            </option>
          ))}
          <option value="new">+ A new tote</option>
          {inside.length > 0 && <option value="out">Take out (not packed)</option>}
        </select>
      </label>
    </div>
  );
}
