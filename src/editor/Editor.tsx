import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from 'zustand';
import { addLevel, canDeleteLevel, deleteLevel, setLevelTable, updateLevel } from '../domain/edits';
import { duplicateProject } from '../domain/project';
import type { Project } from '../domain/schema';
import { studsToInches, inchesToStuds, formatLength } from '../domain/units';
import { checkLayout } from '../domain/validation';
import type { ProjectRepository } from '../storage/repository';
import { Modal } from '../ui/Modal';
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  fitToLevel,
  nudgeSelection,
  paste,
  rotateSelection,
  selectAll,
  zoomBy,
} from './actions';
import { startAutosave, type Autosave } from './autosave';
import { Canvas } from './Canvas';
import { Palette, Properties } from './Panels';
import { createEditorStore, type EditorStore } from './store';
import { toScreen } from './view';

export function Editor({ repo, id, onBack }: { repo: ProjectRepository; id: string; onBack: () => void }) {
  const [loaded, setLoaded] = useState<{ store: EditorStore; autosave: Autosave } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let autosave: Autosave | undefined;
    repo.getProject(id).then(
      (p) => {
        if (cancelled) return;
        const store = createEditorStore(p);
        autosave = startAutosave(store, repo);
        setLoaded({ store, autosave });
      },
      (e: Error) => setError(e.message),
    );
    return () => {
      cancelled = true;
      if (autosave) {
        autosave.flush().finally(() => autosave!.stop());
      }
    };
  }, [repo, id]);

  if (error)
    return (
      <div className="page">
        <p className="banner error" role="alert">{error}</p>
        <button type="button" onClick={onBack}>← Projects</button>
      </div>
    );
  if (!loaded) return null;
  return <EditorScreen store={loaded.store} autosave={loaded.autosave} repo={repo} onBack={onBack} />;
}

function EditorScreen({ store, autosave, repo, onBack }: { store: EditorStore; autosave: Autosave; repo: ProjectRepository; onBack: () => void }) {
  useKeyboard(store);
  useFlushWhenHidden(autosave);
  const saveState = useStore(store, (s) => s.saveState);
  const saveError = useStore(store, (s) => s.saveError);
  const project = useStore(store, (s) => s.project);

  const back = async () => {
    await autosave.flush();
    onBack();
  };

  return (
    <div className="editor">
      <Toolbar store={store} onBack={back} />
      {saveState === 'conflict' && (
        <div className="banner error" role="alert">
          <span>This project was changed in another tab or window, so your latest changes here were not saved.</span>
          <span className="banner-actions">
            <button
              type="button"
              onClick={async () => {
                const copy = duplicateProject(project, `${project.name} (my changes)`);
                await repo.createProject(copy);
                window.location.hash = `#/project/${copy.id}`;
              }}
            >
              Save mine as a copy
            </button>
            <button type="button" onClick={() => window.location.reload()}>Reload latest</button>
          </span>
        </div>
      )}
      {saveState === 'error' && (
        <div className="banner error" role="alert">
          <span>Could not save: {saveError}. Your next change will try again; export a copy if this keeps happening.</span>
        </div>
      )}
      <div className="workspace">
        <Palette store={store} />
        <Canvas store={store} />
        <Properties store={store} />
      </div>
      <StatusBar store={store} />
    </div>
  );
}

function Toolbar({ store, onBack }: { store: EditorStore; onBack: () => void }) {
  const project = useStore(store, (s) => s.project);
  const canUndo = useStore(store, (s) => s.past.length > 0);
  const canRedo = useStore(store, (s) => s.future.length > 0);
  const mode = useStore(store, (s) => s.mode);
  const saveState = useStore(store, (s) => s.saveState);
  const s = store.getState();
  return (
    <header className="topbar toolbar">
      <button type="button" onClick={onBack}>← Projects</button>
      <h1 title={project.name}>{project.name}</h1>
      <span className="save-state" role="status" data-state={saveState}>
        {{ saved: 'Saved', pending: 'Saving…', saving: 'Saving…', error: 'Not saved', conflict: 'Not saved' }[saveState]}
      </span>
      <div className="tool-group">
        <button type="button" onClick={s.undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
        <button type="button" onClick={s.redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
      </div>
      <div className="tool-group" role="group" aria-label="Pointer mode">
        <button type="button" aria-pressed={mode === 'select'} onClick={() => s.set({ mode: 'select' })} title="Select and move (V)">Select</button>
        <button type="button" aria-pressed={mode === 'pan'} onClick={() => s.set({ mode: 'pan' })} title="Pan (H, or hold Space)">Pan</button>
      </div>
      <div className="tool-group">
        <button type="button" onClick={() => zoomBy(store, 1 / 1.25)} title="Zoom out (−)" aria-label="Zoom out">−</button>
        <button type="button" onClick={() => fitToLevel(store)} title="Fit to table (F)">Fit</button>
        <button type="button" onClick={() => zoomBy(store, 1.25)} title="Zoom in (+)" aria-label="Zoom in">+</button>
      </div>
      <label className="tool-select">
        Snap
        <select
          value={project.settings.snap}
          onChange={(e) => s.commit((p) => ({ ...p, settings: { ...p.settings, snap: e.target.value as Project['settings']['snap'] } }))}
        >
          <option value="full">Stud</option>
          <option value="half">Half stud</option>
          <option value="free">Off</option>
        </select>
      </label>
      <LevelControls store={store} />
    </header>
  );
}

function LevelControls({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const levelId = useStore(store, (s) => s.levelId);
  const showOther = useStore(store, (s) => s.showOtherLevels);
  const [dialog, setDialog] = useState<'add' | 'edit' | null>(null);
  const levels = [...project.levels].sort((a, b) => a.order - b.order);
  const switchTo = (id: string) => {
    store.getState().set({ levelId: id });
    store.getState().select([]);
    fitToLevel(store);
  };
  return (
    <div className="tool-group">
      {levels.length > 1 && (
        <label className="tool-select">
          Level
          <select value={levelId} onChange={(e) => switchTo(e.target.value)}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" onClick={() => setDialog('edit')} title="Table and level settings">Table…</button>
      <button type="button" onClick={() => setDialog('add')} title="Add another display level, e.g. a shelf">+ Level</button>
      {levels.length > 1 && (
        <label className="check" title="Show the other levels faintly, for alignment">
          <input type="checkbox" checked={showOther} onChange={(e) => store.getState().set({ showOtherLevels: e.target.checked })} />
          Others
        </label>
      )}
      {dialog && (
        <LevelDialog
          store={store}
          levelId={dialog === 'edit' ? levelId : null}
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setDialog(null);
            switchTo(id);
          }}
        />
      )}
    </div>
  );
}

function LevelDialog({ store, levelId, onClose, onCreated }: { store: EditorStore; levelId: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const project = store.getState().project;
  const level = levelId ? project.levels.find((l) => l.id === levelId) : undefined;
  const table = level ? project.tables.find((t) => t.levelId === level.id) : undefined;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const [name, setName] = useState(level?.name ?? `Shelf ${project.levels.length}`);
  const [tableName, setTableName] = useState(table?.name ?? 'Table');
  const [elevation, setElevation] = useState(level?.elevationIn ?? 30);
  const [width, setWidth] = useState(table ? round1(studsToInches(table.width)) : 96);
  const [depth, setDepth] = useState(table ? round1(studsToInches(table.depth)) : 18);
  const [offX, setOffX] = useState(level ? round1(studsToInches(level.offsetX)) : 0);
  const [offY, setOffY] = useState(level ? round1(studsToInches(level.offsetY)) : 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = store.getState();
    if (!level) {
      let id = '';
      s.commit((p) => {
        const r = addLevel(p, { name, elevationIn: elevation, tableWidthIn: width, tableDepthIn: depth });
        id = r.id;
        return updateLevel(r.project, id, { offsetX: inchesToStuds(offX), offsetY: inchesToStuds(offY) });
      });
      onCreated(id);
      return;
    }
    s.commit((p) =>
      setLevelTable(
        updateLevel(p, level.id, { name: name.trim() || level.name, elevationIn: elevation, offsetX: inchesToStuds(offX), offsetY: inchesToStuds(offY) }),
        level.id,
        tableName,
        width,
        depth,
      ),
    );
    onClose();
  };

  const multi = project.levels.length > 1 || !level;
  return (
    <Modal title={level ? 'Table & level' : 'Add level'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {multi && (
          <label>
            Level name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>
        )}
        {level && (
          <label>
            Table name
            <input value={tableName} onChange={(e) => setTableName(e.target.value)} maxLength={80} />
          </label>
        )}
        <div className="row">
          <label>
            Table width (in)
            <input type="number" min={1} step="any" value={width} onChange={(e) => setWidth(Number(e.target.value))} required />
          </label>
          <label>
            Table depth (in)
            <input type="number" min={1} step="any" value={depth} onChange={(e) => setDepth(Number(e.target.value))} required />
          </label>
        </div>
        <p className="muted small">
          {formatLength(inchesToStuds(width), 'studs')} × {formatLength(inchesToStuds(depth), 'studs')}
        </p>
        {multi && (
          <>
            <label>
              Height above floor (in)
              <input type="number" min={0} step="any" value={elevation} onChange={(e) => setElevation(Number(e.target.value))} />
            </label>
            <div className="row">
              <label>
                Overview offset right (in)
                <input type="number" step="any" value={offX} onChange={(e) => setOffX(Number(e.target.value))} />
              </label>
              <label>
                Overview offset back→front (in)
                <input type="number" step="any" value={offY} onChange={(e) => setOffY(Number(e.target.value))} />
              </label>
            </div>
          </>
        )}
        <footer className="modal-actions">
          {level && canDeleteLevel(project, level.id) && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                const s = store.getState();
                const remaining = project.levels.filter((l) => l.id !== level.id).sort((a, b) => a.order - b.order)[0]!;
                s.set({ levelId: remaining.id });
                s.commit((p) => deleteLevel(p, level.id));
                onClose();
              }}
            >
              Delete empty level
            </button>
          )}
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">{level ? 'Save' : 'Add level'}</button>
        </footer>
      </form>
    </Modal>
  );
}

function StatusBar({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const levelId = useStore(store, (s) => s.levelId);
  const pointer = useStore(store, (s) => s.pointer);
  const view = useStore(store, (s) => s.view);
  const [open, setOpen] = useState(false);
  const warnings = useMemo(() => checkLayout(project).filter((w) => w.levelId === levelId), [project, levelId]);
  const unit = project.settings.displayUnit;
  const counts = useMemo(() => {
    const mods = project.modules.filter((m) => m.levelId === levelId).length;
    const objs = project.objects.filter((o) => o.levelId === levelId).length;
    return `${mods} module${mods === 1 ? '' : 's'}${objs ? ` · ${objs} ride${objs === 1 ? '' : 's'} & items` : ''}`;
  }, [project, levelId]);

  const show = (ids: string[]) => {
    const s = store.getState();
    s.select(ids);
    const item = [...s.project.modules, ...s.project.objects].find((i) => i.id === ids[0]);
    if (item) {
      // Centre the first item in view without changing zoom.
      const p = toScreen(s.view, item.x + item.width / 2, item.y + item.depth / 2);
      s.setView({ ...s.view, x: s.view.x + s.viewport.width / 2 - p.x, y: s.view.y + s.viewport.height / 2 - p.y });
    }
    setOpen(false);
  };

  return (
    <footer className="statusbar">
      <span>{counts}</span>
      <span className="muted" data-testid="pointer">
        {pointer ? `${formatLength(Math.floor(pointer.x), unit)}, ${formatLength(Math.floor(pointer.y), unit)}` : ' '}
      </span>
      <span className="muted">{Math.round(view.scale * 10) / 10} px/stud</span>
      <label className="tool-select">
        Units
        <select
          value={unit}
          onChange={(e) => store.getState().commit((p) => ({ ...p, settings: { ...p.settings, displayUnit: e.target.value as typeof unit } }))}
        >
          <option value="in">inches</option>
          <option value="cm">cm</option>
          <option value="studs">studs</option>
        </select>
      </label>
      <span className="spacer" />
      <div className="warnings">
        <button type="button" className={warnings.length ? 'warn-btn has' : 'warn-btn'} onClick={() => setOpen(!open)} disabled={!warnings.length}>
          {warnings.length ? `⚠ ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'No warnings'}
        </button>
        {open && warnings.length > 0 && (
          <ul className="warn-list" role="list">
            {warnings.map((w, i) => (
              <li key={i}>
                <button type="button" className="link" onClick={() => show(w.ids)}>
                  {w.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}

/** Keyboard shortcuts. Ignored while typing in a field or when a dialog is open. */
function useKeyboard(store: EditorStore) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select') || document.querySelector('dialog[open]')) return;
      const s = store.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const big = e.shiftKey ? 10 : 1;
      const handled = () => e.preventDefault();
      if (mod && key === 'z') return handled(), e.shiftKey ? s.redo() : s.undo();
      if (mod && key === 'y') return handled(), s.redo();
      if (mod && key === 'a') return handled(), selectAll(store);
      if (mod && key === 'd') return handled(), duplicateSelection(store);
      if (mod && key === 'c') return handled(), copySelection(store);
      if (mod && key === 'v') return handled(), paste(store);
      if (mod) return;
      switch (e.key) {
        case 'ArrowLeft': return handled(), nudgeSelection(store, -big, 0);
        case 'ArrowRight': return handled(), nudgeSelection(store, big, 0);
        case 'ArrowUp': return handled(), nudgeSelection(store, 0, -big);
        case 'ArrowDown': return handled(), nudgeSelection(store, 0, big);
        case 'Delete':
        case 'Backspace': return handled(), deleteSelection(store);
        case 'Escape': return s.drag ? s.set({ drag: null }) : s.select([]);
      }
      if (key === 'r') return handled(), rotateSelection(store, e.shiftKey ? -1 : 1);
      if (key === 'f') return handled(), fitToLevel(store);
      if (key === 'v') return s.set({ mode: 'select' });
      if (key === 'h') return s.set({ mode: 'pan' });
      if (e.key === '+' || e.key === '=') return handled(), zoomBy(store, 1.25);
      if (e.key === '-' || e.key === '_') return handled(), zoomBy(store, 1 / 1.25);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);
}

/** iPad Safari may kill a backgrounded tab: save as soon as the page is hidden. */
function useFlushWhenHidden(autosave: Autosave) {
  const ref = useRef(autosave);
  useEffect(() => {
    ref.current = autosave;
  }, [autosave]);
  useEffect(() => {
    const onHide = (e: Event) => {
      if (e.type === 'pagehide' || document.visibilityState === 'hidden') ref.current.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);
}
