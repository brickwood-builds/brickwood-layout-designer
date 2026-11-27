// Trial interface: the editor. The idea is that the layout fills the screen and the controls
// come to you:
//  • a slim bar along the top (back, name, undo/redo, warnings, view, more);
//  • a library on the left to add things (search, a few kinds, pick → click to place);
//  • a small floating bar next to whatever is selected (turn, copy, shape, delete, details);
//  • a details card only when asked for;
//  • the tools in a dock at the bottom, with one line saying what a click does now.
// Underneath it is the same editor as the app (canvas, store, saving, undo, keyboard).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ProjectRepository } from '../storage/repository';
import { createEditorStore, type EditorStore } from '../editor/store';
import { startAutosave, type Autosave } from '../editor/autosave';
import { Canvas } from '../editor/Canvas';
import { Properties } from '../editor/Panels';
import { LayersMenu } from '../editor/LayersMenu';
import { LevelDialog, useFlushWhenHidden, useKeyboard } from '../editor/Editor';
import { ERASE_SHAPES } from '../editor/drawTool';
import {
  deleteSelection,
  duplicateSelection,
  fitToLevel,
  groupSelection,
  rotateSelection,
  setSelectionAngle,
  turnSelection,
  ungroupSelection,
  zoomBy,
} from '../editor/actions';
import { allItems, angleOf, canEditShape, findItem, isModule, resizeModule, updateModule, updateObject, type Item } from '../domain/edits';
import { footprint, unionRect } from '../domain/geometry';
import { groupOf, resizeObject } from '../domain/objects';
import { checkLayout } from '../domain/validation';
import { splitWarnings } from '../domain/objects';
import { milsKindForSize, moduleDisplayName } from '../domain/schema';
import { formatLength } from '../domain/units';
import { LegoColorPicker } from '../ui/LegoColorPicker';
import { toScreen } from '../editor/view';
import { NextLibrary } from './NextLibrary';
import { Icon } from './icons';

export function NextEditor({ repo, id, onBack }: { repo: ProjectRepository; id: string; onBack: () => void }) {
  const [loaded, setLoaded] = useState<{ store: EditorStore; autosave: Autosave } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let autosave: Autosave | undefined;
    let cancelled = false;
    repo.getProject(id).then(
      (p) => {
        if (cancelled) return;
        const store = createEditorStore(p);
        autosave = startAutosave(store, repo, 600);
        setLoaded({ store, autosave });
      },
      (e: Error) => setError(e.message),
    );
    return () => {
      cancelled = true;
      if (autosave) autosave.flush().finally(() => autosave!.stop());
    };
  }, [repo, id]);
  if (error)
    return (
      <div className="nx nx-home">
        <p className="nx-note">{error}</p>
        <button type="button" className="nx-btn" onClick={onBack}>
          Back
        </button>
      </div>
    );
  if (!loaded) return null;
  return <Screen store={loaded.store} autosave={loaded.autosave} onBack={onBack} />;
}

function Screen({ store, autosave, onBack }: { store: EditorStore; autosave: Autosave; onBack: () => void }) {
  useKeyboard(store);
  useFlushWhenHidden(autosave);
  const [library, setLibrary] = useState(true);
  const [details, setDetails] = useState(false);
  const mode = useStore(store, (s) => s.mode);
  const selection = useStore(store, (s) => s.selection);
  // Fit the table into view once the canvas has its size.
  const viewport = useStore(store, (s) => s.viewport.width);
  useEffect(() => {
    if (viewport) fitToLevel(store);
    // Only when the canvas first gets its size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport > 0]);
  // Draw, Erase and Measure have settings: show them in the card while the tool is on.
  const toolCard = mode === 'draw' || mode === 'measure';

  return (
    <div className="nx nx-editor">
      <TopBar
        store={store}
        library={library}
        onLibrary={() => setLibrary(!library)}
        onBack={async () => {
          await autosave.flush();
          onBack();
        }}
      />
      <div className="nx-body">
        {library && <NextLibrary store={store} onClose={() => setLibrary(false)} />}
        <div className="nx-stage">
          <Canvas store={store} />
          {mode === 'select' && selection.length > 0 && <SelectionBar store={store} details={details} onDetails={() => setDetails(!details)} />}
          <Dock store={store} />
          <Hint store={store} />
          <Zoom store={store} />
          {toolCard ? (
            <aside className="nx-card-panel nx-tool-card" aria-label="Tool settings">
              <Properties store={store} />
            </aside>
          ) : (
            details && selection.length > 0 && <DetailsCard store={store} onClose={() => setDetails(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Slim bar: back, name (click to rename), undo/redo, warnings, view and more. */
function TopBar({ store, library, onLibrary, onBack }: { store: EditorStore; library: boolean; onLibrary: () => void; onBack: () => void }) {
  const project = useStore(store, (s) => s.project);
  const levelId = useStore(store, (s) => s.levelId);
  const canUndo = useStore(store, (s) => s.past.length > 0);
  const canRedo = useStore(store, (s) => s.future.length > 0);
  const saveState = useStore(store, (s) => s.saveState);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<'warnings' | 'more' | null>(null);
  const [tableDialog, setTableDialog] = useState(false);
  const warnings = useMemo(() => splitWarnings(project, checkLayout(project).filter((w) => w.levelId === levelId)).open, [project, levelId]);
  const s = store.getState();
  return (
    <header className="nx-top">
      <button type="button" className="nx-icon-btn" onClick={onBack} title="Your layouts" aria-label="Back to your layouts">
        <Icon name="back" />
      </button>
      {renaming === null ? (
        <button type="button" className="nx-title" onClick={() => setRenaming(project.name)} title="Click to rename">
          {project.name}
        </button>
      ) : (
        <input
          className="nx-title-input"
          autoFocus
          aria-label="Layout name"
          value={renaming}
          onChange={(e) => setRenaming(e.target.value)}
          onBlur={() => {
            if (renaming.trim() && renaming.trim() !== project.name) s.commit((p) => ({ ...p, name: renaming.trim() }));
            setRenaming(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRenaming(null);
          }}
        />
      )}
      <span className={`nx-saved ${saveState}`} title={saveState === 'saved' ? 'All changes saved' : 'Saving…'} aria-label={saveState === 'saved' ? 'Saved' : 'Saving'} />
      <div className="nx-grow" />
      <button type="button" className={`nx-btn ${library ? 'nx-on' : ''}`} onClick={onLibrary} aria-pressed={library} title="Add plates, buildings, items and pieces">
        <Icon name="plus" /> Add
      </button>
      <div className="nx-sep" />
      <button type="button" className="nx-icon-btn" onClick={s.undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
        <Icon name="undo" />
      </button>
      <button type="button" className="nx-icon-btn" onClick={s.redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
        <Icon name="redo" />
      </button>
      <div className="nx-sep" />
      <div className="nx-pop-wrap">
        <button
          type="button"
          className={`nx-btn ${warnings.length ? 'nx-warn' : ''}`}
          aria-expanded={menu === 'warnings'}
          onClick={() => setMenu(menu === 'warnings' ? null : 'warnings')}
          title={warnings.length ? 'Things that overlap or hang off the table' : 'Nothing overlaps or hangs off the table'}
        >
          {warnings.length ? (
            <>
              <Icon name="warning" /> {warnings.length}
            </>
          ) : (
            <>
              <Icon name="check" /> All good
            </>
          )}
        </button>
        {menu === 'warnings' && warnings.length > 0 && (
          <div className="nx-pop" role="menu">
            {warnings.map((w) => (
              <button
                key={w.message}
                type="button"
                className="nx-menu-item"
                onClick={() => {
                  s.select(w.ids);
                  setMenu(null);
                }}
              >
                {w.message}
              </button>
            ))}
          </div>
        )}
      </div>
      <LayersMenu store={store} />
      <div className="nx-pop-wrap">
        <button type="button" className="nx-icon-btn" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')} title="More" aria-label="More">
          <Icon name="more" />
        </button>
        {menu === 'more' && (
          <div className="nx-pop" role="menu">
            <button
              type="button"
              className="nx-menu-item"
              onClick={() => {
                setTableDialog(true);
                setMenu(null);
              }}
            >
              <Icon name="table" /> Table shape and size…
            </button>
            <button type="button" className="nx-menu-item" onClick={() => window.open(`./#/project/${project.id}`, '_blank')} title="The full app (your real layouts, not this trial copy)">
              <Icon name="print" /> Open the main app
            </button>
          </div>
        )}
      </div>
      {tableDialog && <LevelDialog store={store} levelId={levelId} onAddLevel={() => setTableDialog(false)} onClose={() => setTableDialog(false)} onCreated={() => setTableDialog(false)} />}
    </header>
  );
}

/** Small floating bar just above what's selected. */
function SelectionBar({ store, details, onDetails }: { store: EditorStore; details: boolean; onDetails: () => void }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const view = useStore(store, (s) => s.view);
  const viewport = useStore(store, (s) => s.viewport);
  const dragging = useStore(store, (s) => !!s.drag);
  const editingPath = useStore(store, (s) => s.editingPath);
  const items = allItems(project).filter((i) => selection.includes(i.id));
  const box = unionRect(items.map(footprint));
  if (!box || dragging) return null;
  const a = toScreen(view, box.x, box.y);
  const b = toScreen(view, box.x + box.width, box.y + box.depth);
  // Above the selection when there's room, else below; kept inside the canvas.
  const width = 300;
  const left = Math.min(Math.max(8, (a.x + b.x) / 2 - width / 2), viewport.width - width - 8);
  const top = a.y > 60 ? a.y - 52 : Math.min(b.y + 10, viewport.height - 110);
  const one = items.length === 1 ? items[0]! : null;
  const grouped = selection.some((id) => groupOf(project, id));
  const editing = !!one && editingPath === one.id;
  return (
    <div className="nx-selbar" style={{ left, top }} role="toolbar" aria-label="Selection">
      <span className="nx-selbar-name">{one ? (isModule(one) ? moduleDisplayName(one) : one.name || 'Item') : `${items.length} selected`}</span>
      <BarBtn icon="rotate" label="Turn a quarter (R)" onClick={() => rotateSelection(store, 1)} />
      <BarBtn icon="turn" label="Turn 5° (Shift+])" onClick={() => turnSelection(store, 5)} />
      <BarBtn icon="copy" label="Duplicate (Ctrl+D)" onClick={() => duplicateSelection(store)} />
      {one && canEditShape(one) && (
        <BarBtn icon="shape" label={editing ? 'Done editing shape' : 'Edit shape: drag corners, + adds one, double-click removes'} on={editing} onClick={() => store.getState().set({ editingPath: editing ? null : one.id })} />
      )}
      {items.length > 1 && !grouped && <BarBtn icon="group" label="Group (Ctrl+G)" onClick={() => groupSelection(store)} />}
      {grouped && <BarBtn icon="group" label="Ungroup (Ctrl+Shift+G)" on onClick={() => ungroupSelection(store)} />}
      <BarBtn icon="info" label="Details" on={details} onClick={onDetails} />
      <BarBtn icon="trash" label="Delete (Del)" danger onClick={() => deleteSelection(store)} />
    </div>
  );
}

function BarBtn({ icon, label, onClick, on, danger }: { icon: string; label: string; onClick: () => void; on?: boolean; danger?: boolean }) {
  return (
    <button type="button" className={`nx-icon-btn ${on ? 'nx-on' : ''} ${danger ? 'nx-danger' : ''}`} onClick={onClick} title={label} aria-label={label} aria-pressed={on}>
      <Icon name={icon} />
    </button>
  );
}

/** Just what you usually need: name, size, colour, angle. Everything else one click away. */
function DetailsCard({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const [all, setAll] = useState(false);
  const item = selection.length === 1 ? findItem(project, selection[0]!) : undefined;
  return (
    <aside className="nx-card-panel" aria-label="Details">
      <div className="nx-card-head">
        <strong>{item ? (isModule(item) ? (item.label ? 'Plate' : 'Building or ride') : { footprint: 'Feature', item: 'Small item', setupMarker: 'Marker', piece: 'LEGO piece' }[item.type]) : `${selection.length} selected`}</strong>
        <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Close details">
          <Icon name="close" />
        </button>
      </div>
      {all || !item ? (
        <div className="nx-all">
          <Properties store={store} />
        </div>
      ) : (
        <>
          <QuickFields key={item.id} store={store} item={item} />
          <button type="button" className="nx-link" onClick={() => setAll(true)}>
            All details…
          </button>
        </>
      )}
    </aside>
  );
}

function QuickFields({ store, item }: { store: EditorStore; item: Item }) {
  const unit = useStore(store, (s) => s.project.settings.displayUnit);
  const commit = store.getState().commit;
  const setName = (v: string) => commit((p) => (isModule(item) ? updateModule(p, item.id, item.label ? { label: v } : { name: v }) : updateObject(p, item.id, { name: v })));
  const setSize = (w: number, d: number) =>
    commit((p) => (isModule(item) ? resizeModule(p, item.id, milsKindForSize(w, d), w, d, p.settings.snap) : resizeObject(p, item.id, w, d, p.settings.snap)));
  return (
    <div className="nx-fields">
      <Quick label={isModule(item) && item.label ? 'ID' : 'Name'} value={isModule(item) ? item.label || item.name : item.name} onCommit={setName} />
      <div className="nx-row">
        <Quick label="Width" suffix="studs" value={String(item.width)} numeric onCommit={(v) => Number(v) > 0 && setSize(Number(v), item.depth)} hint={unit === 'studs' ? undefined : formatLength(item.width, unit)} />
        <Quick label="Depth" suffix="studs" value={String(item.depth)} numeric onCommit={(v) => Number(v) > 0 && setSize(item.width, Number(v))} hint={unit === 'studs' ? undefined : formatLength(item.depth, unit)} />
      </div>
      <Quick label="Angle" suffix="°" value={String(angleOf(item))} numeric onCommit={(v) => Number.isFinite(Number(v)) && setSelectionAngle(store, item.id, Number(v))} />
      {!isModule(item) && <LegoColorPicker label="Colour" value={item.color} onChange={(hex) => hex && commit((p) => updateObject(p, item.id, { color: hex }))} />}
    </div>
  );
}

/** A field that saves on Enter or when you leave it. */
function Quick({ label, value, onCommit, numeric, suffix, hint }: { label: string; value: string; onCommit: (v: string) => void; numeric?: boolean; suffix?: string; hint?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = () => {
    if (draft !== null && draft.trim() !== value) onCommit(draft.trim());
    setDraft(null);
  };
  return (
    <label className="nx-field">
      <span>{label}</span>
      <span className="nx-input-wrap">
        <input aria-label={label} inputMode={numeric ? 'decimal' : undefined} value={draft ?? value} onChange={(e) => setDraft(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        {suffix && <span className="nx-suffix">{suffix}</span>}
      </span>
      {hint && <small className="nx-muted">{hint}</small>}
    </label>
  );
}

/** The tools, in a dock at the bottom of the layout. */
function Dock({ store }: { store: EditorStore }) {
  const mode = useStore(store, (s) => s.mode);
  const erase = useStore(store, (s) => s.draw.erase);
  const s = store.getState();
  const draw = (e: boolean) => {
    const st = store.getState();
    const shape = e && !ERASE_SHAPES.includes(st.draw.shape) ? 'free' : st.draw.shape === 'outline' ? 'free' : st.draw.shape;
    st.set({ mode: 'draw', measure: null, holding: null, draw: { ...st.draw, erase: e, shape } });
  };
  const tools: [string, string, boolean, () => void][] = [
    ['cursor', 'Select (V)', mode === 'select', () => s.set({ mode: 'select', measure: null })],
    ['hand', 'Move the view (H, or drag empty table)', mode === 'pan', () => s.set({ mode: 'pan', measure: null })],
    ['pencil', 'Draw pieces, e.g. a walkway (B)', mode === 'draw' && !erase, () => draw(false)],
    ['eraser', 'Erase pieces and items (E)', mode === 'draw' && erase, () => draw(true)],
    ['ruler', 'Measure (M)', mode === 'measure', () => s.set({ mode: 'measure' })],
  ];
  return (
    <div className="nx-dock" role="toolbar" aria-label="Tools">
      {tools.map(([icon, label, on, go]) => (
        <button key={icon} type="button" className={`nx-icon-btn ${on ? 'nx-on' : ''}`} onClick={go} title={label} aria-label={label} aria-pressed={on}>
          <Icon name={icon} size={20} />
        </button>
      ))}
    </div>
  );
}

/** One line: what a click does right now, and how to stop. */
function Hint({ store }: { store: EditorStore }) {
  const mode = useStore(store, (s) => s.mode);
  const erase = useStore(store, (s) => s.draw.erase);
  const holding = useStore(store, (s) => s.holding);
  const editing = useStore(store, (s) => !!s.editingPath && s.selection.includes(s.editingPath));
  let text: ReactNode = null;
  if (holding)
    text = (
      <>
        <strong>{holding.label}</strong> — {holding.hint ?? 'click where each one goes'}
        <button type="button" className="nx-link" onClick={() => store.getState().set({ holding: null })}>
          Done
        </button>
      </>
    );
  else if (editing) text = 'Drag a corner to move it · drag a + to add one · double-click a corner to remove it · Esc when done';
  else if (mode === 'draw') text = erase ? 'Drag over pieces and items to remove them · Esc to stop' : 'Drag to paint pieces · Esc to stop';
  else if (mode === 'measure') text = 'Drag between two points · Esc to stop';
  else if (mode === 'pan') text = 'Drag to move the view · Esc to stop';
  if (!text) return null;
  return (
    <div className="nx-hint" role="status">
      {text}
    </div>
  );
}

function Zoom({ store }: { store: EditorStore }) {
  return (
    <div className="nx-zoom" role="group" aria-label="Zoom">
      <button type="button" className="nx-icon-btn" onClick={() => zoomBy(store, 1 / 1.25)} aria-label="Zoom out" title="Zoom out (−)">
        <Icon name="minus" />
      </button>
      <button type="button" className="nx-zoom-fit" onClick={() => fitToLevel(store)} title="Show the whole table (F)">
        <Icon name="fit" size={16} /> Fit
      </button>
      <button type="button" className="nx-icon-btn" onClick={() => zoomBy(store, 1.25)} aria-label="Zoom in" title="Zoom in (+)">
        <Icon name="plus" />
      </button>
    </div>
  );
}
