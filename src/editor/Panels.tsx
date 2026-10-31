import { useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { footprint } from '../domain/geometry';
import { addDimension, deleteDimension, dimensionLength, findItem, isModule, resizeModule, setItemPosition, updateModule, updateObject, type Item } from '../domain/edits';
import { storedNotPlaced, validateLabel } from '../domain/labels';
import { MILS_KINDS, MILS_SIZES, isBase, milsKindForSize, moduleDisplayName, type MilsKind, type MilsModule, type CanvasObject } from '../domain/schema';
import { formatLength } from '../domain/units';
import { deleteSelection, duplicateSelection, groupSelection, rotateSelection, ungroupSelection } from './actions';
import { groupOf, modulesUnder, renameGroup, resizeObject, saveShape } from '../domain/objects';
import { markerKind } from '../domain/catalog';
import { LegoColorPicker } from '../ui/LegoColorPicker';
import type { EditorStore } from './store';

export const KIND_LABEL: Record<MilsKind, string> = { '32x32': '32×32', '32x16': '32×16', '16x16': '16×16', '16x8': '16×8', custom: 'Custom' };

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
  const mode = useStore(store, (s) => s.mode);
  const unit = project.settings.displayUnit;
  if (mode === 'measure') return <MeasurePanel store={store} />;
  if (selection.length === 0) {
    return (
      <aside className="props empty" aria-label="Properties">
        <p className="muted">Select something to see its details. Drag to move; Shift-click or drag a box to select several.</p>
      </aside>
    );
  }
  if (selection.length > 1) {
    const sel = new Set(selection);
    const group = project.groups.find((g) => g.memberIds.length === sel.size && g.memberIds.every((id) => sel.has(id)));
    return (
      <aside className="props" aria-label="Properties" key={group?.id ?? 'multi'}>
        {group ? <GroupFields store={store} groupId={group.id} /> : <h2>{selection.length} selected</h2>}
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
      <h2>{isBase(m) ? 'Feature (on its own base)' : 'MILS module'}</h2>
      <Field
        label="ID (on back of plate)"
        value={m.label}
        validate={(v) => validateLabel(store.getState().project, m.id, v)}
        onCommit={(v) => commit((p) => updateModule(p, m.id, { label: v.trim() }))}
        hint={m.label ? undefined : 'No ID (e.g. a building built on its plate)'}
      />
      <Field label="Name" value={m.name} onCommit={(v) => commit((p) => updateModule(p, m.id, { name: v.trim() }))} />
      {(isBase(m) || m.powerVolts !== undefined) && (
        <Field
          label="Power (volts)"
          type="number"
          step={0.5}
          value={m.powerVolts ?? ''}
          validate={(v) => (v.trim() === '' ? null : positiveOrError(v))}
          onCommit={(v) => commit((p) => updateModule(p, m.id, { powerVolts: v.trim() === '' ? undefined : Number(v) }))}
        />
      )}
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
      {!isBase(m) && (
        <LegoColorPicker
          label="Plate colour (for Finished look)"
          value={m.plateColor}
          allowNone="Not set (shown as Green)"
          onChange={(hex) => commit((p) => updateModule(p, m.id, { plateColor: hex }))}
        />
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
      <h2>{{ footprint: 'Feature', setupMarker: 'Setup marker', item: 'Small item', piece: 'Single piece' }[o.type]}</h2>
      <Field label="Name" value={o.name} onCommit={(v) => commit((p) => updateObject(p, o.id, { name: v.trim() }))} />
      {o.type === 'setupMarker' && markerKind(o.markerKind) && <p className="muted small">Placeholder: {markerKind(o.markerKind)!.brick}</p>}
      <div className="row">
        <Field
          label="Width (studs)"
          type="number"
          value={o.width}
          validate={positiveOrError}
          onCommit={(v) => commit((p) => resizeObject(p, o.id, Number(v), o.depth, p.settings.snap))}
          hint={formatLength(f.width, unit === 'studs' ? 'in' : unit)}
        />
        <Field
          label="Depth (studs)"
          type="number"
          value={o.depth}
          validate={positiveOrError}
          onCommit={(v) => commit((p) => resizeObject(p, o.id, o.width, Number(v), p.settings.snap))}
          hint={formatLength(f.depth, unit === 'studs' ? 'in' : unit)}
        />
      </div>
      <LegoColorPicker label="Colour" value={o.color} onChange={(hex) => hex && commit((p) => updateObject(p, o.id, { color: hex }))} />
      {o.type !== 'footprint' && <OnModules store={store} o={o} />}
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
      <SaveShape store={store} o={o} />
    </>
  );
}

function OnModules({ store, o }: { store: EditorStore; o: CanvasObject }) {
  const project = useStore(store, (s) => s.project);
  const under = modulesUnder(project, o);
  return <p className="muted small">{under.length ? `On ${under.length > 1 ? 'modules' : 'module'} ${under.join(', ')}` : 'Not on a module'}</p>;
}

function SaveShape({ store, o }: { store: EditorStore; o: CanvasObject }) {
  const [done, setDone] = useState(false);
  if (done) return <p className="muted small">Added to the palette.</p>;
  return (
    <button
      type="button"
      onClick={() => {
        store.getState().commit((p) => saveShape(p, o, o.name).project);
        setDone(true);
      }}
      title="Keep this size and colour in the palette so you can add more"
    >
      Add to palette
    </button>
  );
}

function GroupFields({ store, groupId }: { store: EditorStore; groupId: string }) {
  const project = useStore(store, (s) => s.project);
  const group = project.groups.find((g) => g.id === groupId);
  if (!group) return null;
  const members = group.memberIds.map((id) => findItem(project, id)).filter((i): i is Item => !!i);
  const commit = store.getState().commit;
  return (
    <>
      <h2>Group</h2>
      <Field label="Group name" value={group.name} onCommit={(v) => commit((p) => renameGroup(p, group.id, v))} />
      <span className="muted small">{members.length} items — pick one to edit it on its own:</span>
      <div className="chips">
        {members.map((m) => (
          <button key={m.id} type="button" onClick={() => store.getState().select([m.id])}>
            {isModule(m) ? moduleDisplayName(m) : m.name || 'Item'}
          </button>
        ))}
      </div>
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
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const grouped = selection.some((id) => groupOf(project, id));
  return (
    <div className="actions">
      {selection.length > 1 && !grouped && (
        <button type="button" onClick={() => groupSelection(store)} title="Group (Ctrl+G): click any member to pick up the whole group">Group</button>
      )}
      {grouped && <button type="button" onClick={() => ungroupSelection(store)} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>}
      <button type="button" onClick={() => rotateSelection(store, -1)} title="Rotate left (Shift+R)">⟲ Rotate</button>
      <button type="button" onClick={() => rotateSelection(store, 1)} title="Rotate right (R)">⟳ Rotate</button>
      <button type="button" onClick={() => duplicateSelection(store)} title="Duplicate (Ctrl+D)">Duplicate</button>
      <button type="button" className="danger" onClick={() => deleteSelection(store)} title="Delete (Del)">Delete</button>
    </div>
  );
}

/** Measure mode: the current measurement, keeping it, and the level's saved dimensions. */
function MeasurePanel({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const levelId = useStore(store, (s) => s.levelId);
  const measure = useStore(store, (s) => s.measure);
  const [label, setLabel] = useState('');
  const unit = project.settings.displayUnit;
  const saved = project.dimensions.filter((d) => d.levelId === levelId);
  const show = (studs: number) => `${formatLength(studs, unit)}${unit === 'studs' ? '' : ` · ${+studs.toFixed(2)} studs`}`;
  return (
    <aside className="props" aria-label="Properties">
      <h2>Measure</h2>
      <p className="muted small">Drag between two points. Hold Shift for a straight line. Ends snap like modules do.</p>
      {measure && dimensionLength(measure) > 0 ? (
        <>
          <p className="measure-result" data-testid="measure-result">
            {show(dimensionLength(measure))}
          </p>
          <p className="muted small">
            Across {show(Math.abs(measure.x2 - measure.x1))}, down {show(Math.abs(measure.y2 - measure.y1))}
          </p>
          <label className="field">
            <span>Label (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Aisle clearance" />
          </label>
          <button
            type="button"
            className="primary"
            onClick={() => {
              store.getState().commit((p) => addDimension(p, { levelId, ...measure, label: label.trim() }).project);
              store.getState().set({ measure: null });
              setLabel('');
            }}
          >
            Keep this dimension
          </button>
        </>
      ) : (
        <p className="muted">No measurement yet.</p>
      )}
      {saved.length > 0 && (
        <>
          <h2>Saved dimensions</h2>
          <ul className="dim-list">
            {saved.map((d) => (
              <li key={d.id}>
                <span>
                  {d.label ? `${d.label}: ` : ''}
                  {formatLength(dimensionLength(d), unit)}
                </span>
                <button type="button" className="icon" aria-label={`Delete dimension ${d.label || formatLength(dimensionLength(d), unit)}`} onClick={() => store.getState().commit((p) => deleteDimension(p, d.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

