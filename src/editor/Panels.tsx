import { useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { footprint } from '../domain/geometry';
import { findItem, isModule, resizeModule, setItemPosition, updateModule, updateObject, type Item } from '../domain/edits';
import { storedNotPlaced, validateLabel } from '../domain/labels';
import { MILS_KINDS, MILS_SIZES, MILS_COLORS, milsKindForSize, type MilsKind, type MilsModule, type CanvasObject } from '../domain/schema';
import { formatLength } from '../domain/units';
import { Modal } from '../ui/Modal';
import { addModuleAtCenter, deleteSelection, duplicateSelection, rotateSelection } from './actions';
import type { EditorStore } from './store';

const KIND_LABEL: Record<MilsKind, string> = { '32x32': '32×32', '32x16': '32×16', '16x16': '16×16', '16x8': '16×8', custom: 'Custom' };

/** Left column: add MILS modules. */
export function Palette({ store }: { store: EditorStore }) {
  const [custom, setCustom] = useState(false);
  return (
    <aside className="palette" aria-label="Add">
      <h2>Add module</h2>
      {(['32x32', '16x16', '16x8', '32x16'] as const).map((k) => (
        <button key={k} type="button" onClick={() => addModuleAtCenter(store, k)} title={`Add a ${KIND_LABEL[k]} MILS module`}>
          <i className="swatch" style={{ background: MILS_COLORS[k], aspectRatio: `${MILS_SIZES[k].width} / ${MILS_SIZES[k].depth}` }} />
          {KIND_LABEL[k]}
        </button>
      ))}
      <button type="button" onClick={() => setCustom(true)} title="Add a module of any size">
        <i className="swatch" style={{ background: MILS_COLORS.custom, aspectRatio: '1' }} />
        Custom…
      </button>
      {custom && (
        <CustomSizeDialog
          onClose={() => setCustom(false)}
          onAdd={(width, depth) => {
            setCustom(false);
            const kind = milsKindForSize(width, depth);
            addModuleAtCenter(store, kind, { width, depth });
          }}
        />
      )}
    </aside>
  );
}

function CustomSizeDialog({ onAdd, onClose }: { onAdd: (w: number, d: number) => void; onClose: () => void }) {
  const [w, setW] = useState(48);
  const [d, setD] = useState(48);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (w > 0 && d > 0) onAdd(w, d);
  };
  return (
    <Modal title="Custom module" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>
            Width (studs)
            <input type="number" min={1} max={2000} value={w} onChange={(e) => setW(Number(e.target.value))} required autoFocus />
          </label>
          <label>
            Depth (studs)
            <input type="number" min={1} max={2000} value={d} onChange={(e) => setD(Number(e.target.value))} required />
          </label>
        </div>
        <p className="muted">
          {formatLength(w, 'in')} × {formatLength(d, 'in')}
        </p>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Add</button>
        </footer>
      </form>
    </Modal>
  );
}

/** Text/number field that applies its value on Enter or when leaving the field. */
function Field({
  label,
  value,
  onCommit,
  type = 'text',
  validate,
  hint,
  step,
}: {
  label: string;
  value: string | number;
  onCommit: (v: string) => void;
  type?: 'text' | 'number';
  validate?: (v: string) => string | null;
  hint?: ReactNode;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const apply = () => {
    if (draft === null) return;
    const err = validate?.(draft) ?? null;
    setError(err);
    if (err) return;
    if (draft !== String(value)) onCommit(draft);
    setDraft(null);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        step={step}
        value={shown}
        aria-invalid={!!error}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
      />
      {error ? <small className="error" role="alert">{error}</small> : hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

const numberOrError = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? 'Enter a number.' : null);
const positiveOrError = (v: string) => numberOrError(v) ?? (Number(v) > 0 ? null : 'Must be more than 0.');

/** Right column: properties of the selection. */
export function Properties({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const unit = project.settings.displayUnit;
  if (selection.length === 0) {
    return (
      <aside className="props empty" aria-label="Properties">
        <p className="muted">Select a module to see its details. Drag to move; Shift-click or drag a box to select several.</p>
      </aside>
    );
  }
  if (selection.length > 1) {
    return (
      <aside className="props" aria-label="Properties">
        <h2>{selection.length} selected</h2>
        <SelectionActions store={store} />
      </aside>
    );
  }
  const item = findItem(project, selection[0]!);
  if (!item) return null;
  // Remount fields when the selected item changes so drafts don't leak between items.
  return (
    <aside className="props" aria-label="Properties" key={item.id}>
      {isModule(item) ? <ModuleFields store={store} m={item} unit={unit} /> : <ObjectFields store={store} o={item} unit={unit} />}
      <PositionFields store={store} item={item} unit={unit} />
      <Notes
        value={item.notes}
        onCommit={(notes) => store.getState().commit((p) => (isModule(item) ? updateModule(p, item.id, { notes }) : updateObject(p, item.id, { notes })))}
      />
      <SelectionActions store={store} />
    </aside>
  );
}

function ModuleFields({ store, m, unit }: { store: EditorStore; m: MilsModule; unit: 'studs' | 'in' | 'cm' }) {
  const commit = store.getState().commit;
  const project = store.getState().project;
  return (
    <>
      <h2>MILS module</h2>
      <Field
        label="ID (on back of plate)"
        value={m.label}
        validate={(v) => validateLabel(store.getState().project, m.id, v)}
        onCommit={(v) => commit((p) => updateModule(p, m.id, { label: v.trim() }))}
        hint={m.label ? undefined : 'No ID (e.g. a building built on its plate)'}
      />
      <Field label="Name" value={m.name} onCommit={(v) => commit((p) => updateModule(p, m.id, { name: v.trim() }))} />
      <label className="field">
        <span>Size</span>
        <select
          value={m.kind}
          onChange={(e) => {
            const kind = e.target.value as MilsKind;
            const size = kind === 'custom' ? { width: m.width, depth: m.depth } : MILS_SIZES[kind];
            commit((p) => resizeModule(p, m.id, kind, size.width, size.depth, p.settings.snap));
          }}
        >
          {MILS_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {m.kind === 'custom' && (
        <div className="row">
          <Field
            label="Width (studs)"
            type="number"
            value={m.width}
            validate={positiveOrError}
            onCommit={(v) => commit((p) => resizeModule(p, m.id, milsKindForSize(Number(v), m.depth), Number(v), m.depth, p.settings.snap))}
            hint={formatLength(m.width, unit === 'studs' ? 'in' : unit)}
          />
          <Field
            label="Depth (studs)"
            type="number"
            value={m.depth}
            validate={positiveOrError}
            onCommit={(v) => commit((p) => resizeModule(p, m.id, milsKindForSize(m.width, Number(v)), m.width, Number(v), p.settings.snap))}
            hint={formatLength(m.depth, unit === 'studs' ? 'in' : unit)}
          />
        </div>
      )}
      {storedNotPlaced(project).length > 0 && <p className="muted small">Plates not in this layout: {storedNotPlaced(project).join(', ')}</p>}
      {project.retiredLabels.length > 0 && <p className="muted small">Retired IDs (never reused): {project.retiredLabels.join(', ')}</p>}
    </>
  );
}

function ObjectFields({ store, o, unit }: { store: EditorStore; o: CanvasObject; unit: 'studs' | 'in' | 'cm' }) {
  const commit = store.getState().commit;
  const f = footprint(o);
  return (
    <>
      <h2>{o.type === 'footprint' ? 'Ride / building' : o.type === 'setupMarker' ? 'Setup marker' : 'Item'}</h2>
      <Field label="Name" value={o.name} onCommit={(v) => commit((p) => updateObject(p, o.id, { name: v.trim() }))} />
      <p className="muted small">
        Size {formatLength(f.width, unit)} × {formatLength(f.depth, unit)}
      </p>
      {o.type === 'footprint' && (
        <Field
          label="Power (volts)"
          type="number"
          step={0.5}
          value={o.powerVolts ?? ''}
          validate={(v) => (v.trim() === '' ? null : positiveOrError(v))}
          onCommit={(v) => commit((p) => updateObject(p, o.id, { powerVolts: v.trim() === '' ? undefined : Number(v) }))}
        />
      )}
    </>
  );
}

function PositionFields({ store, item, unit }: { store: EditorStore; item: Item; unit: 'studs' | 'in' | 'cm' }) {
  const commit = store.getState().commit;
  const hint = (studs: number) => (unit === 'studs' ? undefined : formatLength(studs, unit));
  return (
    <div className="row">
      <Field
        label="X (studs)"
        type="number"
        value={item.x}
        validate={numberOrError}
        onCommit={(v) => commit((p) => setItemPosition(p, item.id, Number(v), item.y))}
        hint={hint(item.x)}
      />
      <Field
        label="Y (studs)"
        type="number"
        value={item.y}
        validate={numberOrError}
        onCommit={(v) => commit((p) => setItemPosition(p, item.id, item.x, Number(v)))}
        hint={hint(item.y)}
      />
    </div>
  );
}

function Notes({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="field">
      <span>Notes</span>
      <textarea
        rows={3}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== value) onCommit(draft);
          setDraft(null);
        }}
      />
    </label>
  );
}

function SelectionActions({ store }: { store: EditorStore }) {
  return (
    <div className="actions">
      <button type="button" onClick={() => rotateSelection(store, -1)} title="Rotate left (Shift+R)">⟲ Rotate</button>
      <button type="button" onClick={() => rotateSelection(store, 1)} title="Rotate right (R)">⟳ Rotate</button>
      <button type="button" onClick={() => duplicateSelection(store)} title="Duplicate (Ctrl+D)">Duplicate</button>
      <button type="button" className="danger" onClick={() => deleteSelection(store)} title="Delete (Del)">Delete</button>
    </div>
  );
}
