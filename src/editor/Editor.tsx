import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { addLevel, canDeleteLevel, deleteLevel, setLevelTable, updateLevel } from '../domain/edits';
import { duplicateProject } from '../domain/project';
import { isBase, type Project } from '../domain/schema';
import { studsToInches, inchesToStuds, formatLength } from '../domain/units';
import { checkLayout } from '../domain/validation';
import { acknowledge, canAcknowledge, splitWarnings, unacknowledge, warningKey } from '../domain/objects';
import type { ProjectRepository } from '../storage/repository';
import { Modal } from '../ui/Modal';
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  fitToLevel,
  groupSelection,
  ungroupSelection,
  nudgeSelection,
  paste,
  rotateSelection,
  selectAll,
  zoomBy,
} from './actions';
import { startAutosave, type Autosave } from './autosave';
import { useFileSync } from './fileSync';
import type { FileLinks } from '../storage/fileLink';
import { Canvas } from './Canvas';
import { Properties } from './Panels';
import { Palette } from './Palette';
import { LayersMenu } from './LayersMenu';
import { HelpButton } from '../help/HelpDialog';
import { createEditorStore, type EditorStore } from './store';
import { toScreen } from './view';

type OnSaved = (p: Project) => void;

export function Editor({ repo, links, id, onBack }: { repo: ProjectRepository; links: FileLinks; id: string; onBack: () => void }) {
  const [loaded, setLoaded] = useState<{ store: EditorStore; autosave: Autosave; registerOnSaved: (fn: OnSaved) => void } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let autosave: Autosave | undefined;
    repo.getProject(id).then(
      (p) => {
        if (cancelled) return;
        const store = createEditorStore(p);
        // Lets the linked-file sync hear about each successful save.
        let onSaved: OnSaved | undefined;
        autosave = startAutosave(store, repo, 600, (saved) => onSaved?.(saved));
        setLoaded({ store, autosave, registerOnSaved: (fn) => (onSaved = fn) });
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
  return <EditorScreen store={loaded.store} autosave={loaded.autosave} repo={repo} links={links} registerOnSaved={loaded.registerOnSaved} onBack={onBack} />;
}

function EditorScreen({
  store,
  autosave,
  repo,
  links,
  registerOnSaved,
  onBack,
}: {
  store: EditorStore;
  autosave: Autosave;
  repo: ProjectRepository;
  links: FileLinks;
  registerOnSaved: (fn: OnSaved) => void;
  onBack: () => void;
}) {
  useKeyboard(store);
  useFlushWhenHidden(autosave);
  const file = useFileSync(store, repo, links, autosave, registerOnSaved);
  const saveState = useStore(store, (s) => s.saveState);
  const saveError = useStore(store, (s) => s.saveError);
  const project = useStore(store, (s) => s.project);

  const back = async () => {
    await autosave.flush();
    onBack();
  };

  return (
    <div className="editor">
      <Toolbar
        store={store}
        onBack={back}
        onPrint={async () => {
          await autosave.flush();
          window.location.hash = `#/project/${project.id}/print`;
        }}
      />
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
      {file.state.kind === 'changed' && (
        <div className="banner error" role="alert">
          <span>
            <strong>{file.state.link.fileName}</strong> was changed somewhere else (probably on another computer), so this version wasn’t saved to it.
            Whichever you don’t pick is kept as a checkpoint.
          </span>
          <span className="banner-actions">
            <button type="button" onClick={() => file.useFileVersion()}>Use the file’s version</button>
            <button type="button" onClick={() => file.keepThisVersion()}>Keep this version</button>
          </span>
        </div>
      )}
      {file.state.kind === 'error' && (
        <div className="banner error" role="alert">
          <span>
            Couldn’t save to <strong>{file.state.link.fileName}</strong>: {file.state.message}
          </span>
          <span className="banner-actions">
            <button type="button" onClick={() => file.writeNow()}>Try again</button>
            <button type="button" onClick={() => file.stop()}>Stop saving to the file</button>
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
      <StatusBar store={store} file={<FileStatus file={file} />} />
    </div>
  );
}

function Toolbar({ store, onBack, onPrint }: { store: EditorStore; onBack: () => void; onPrint: () => void }) {
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
      <span className="save-state" role="status" data-state={saveState} title="Every change saves automatically within a second">
        {saveState === 'saved'
          ? `Saved ${savedWhen(project.updatedAt)}`
          : { pending: 'Saving…', saving: 'Saving…', error: 'Not saved', conflict: 'Not saved' }[saveState]}
      </span>
      <div className="tool-group">
        <button type="button" onClick={s.undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
        <button type="button" onClick={s.redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
      </div>
      <div className="tool-group" role="group" aria-label="Pointer mode">
        <button type="button" aria-pressed={mode === 'select'} onClick={() => s.set({ mode: 'select', measure: null })} title="Select and move (V)">Select</button>
        <button type="button" aria-pressed={mode === 'pan'} onClick={() => s.set({ mode: 'pan', measure: null })} title="Pan (H, or hold Space)">Pan</button>
        <button type="button" aria-pressed={mode === 'measure'} onClick={() => s.set({ mode: 'measure' })} title="Measure: drag between two points (M)">Measure</button>
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
      <LayersMenu store={store} />
      <button type="button" onClick={onPrint} title="Printable plan, PDF and picture downloads">Print…</button>
      <HelpButton context={mode === 'measure' ? 'measure' : 'editor'} />
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
      <button type="button" onClick={() => setDialog('edit')} title="Table size and display levels">Table…</button>
      {levels.length > 1 && (
        <label className="check" title="Show the other levels faintly, for alignment">
          <input type="checkbox" checked={showOther} onChange={(e) => store.getState().set({ showOtherLevels: e.target.checked })} />
          Others
        </label>
      )}
      {dialog && (
        <LevelDialog
          key={dialog}
          store={store}
          levelId={dialog === 'edit' ? levelId : null}
          onAddLevel={() => setDialog('add')}
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

function LevelDialog({
  store,
  levelId,
  onAddLevel,
  onClose,
  onCreated,
}: {
  store: EditorStore;
  levelId: string | null;
  onAddLevel: () => void;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
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
          {level && (
            <button type="button" className="footer-left" onClick={onAddLevel} title="Another surface, e.g. a shelf above this table">
              Add a level…
            </button>
          )}
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

/** Status-bar control for "Save to a file" (Chrome/Edge on a computer). */
function FileStatus({ file }: { file: ReturnType<typeof useFileSync> }) {
  const s = file.state;
  const [menu, setMenu] = useState(false);
  switch (s.kind) {
    case 'unsupported':
    case 'loading':
      return null;
    case 'none':
      return (
        <button type="button" className="file-btn" onClick={() => file.linkNow()} title="Pick a file (for example in your OneDrive folder); the project then keeps saving there too">
          Save to a file…
        </button>
      );
    case 'paused':
      return (
        <button type="button" className="file-btn warn" onClick={() => file.resume()} title="The browser needs your OK again after a restart">
          Resume saving to {s.link.fileName}
        </button>
      );
    default:
      return (
        <span className="popover-wrap">
          <button type="button" className={s.kind === 'ok' ? 'file-btn ok' : 'file-btn warn'} onClick={() => setMenu(!menu)} aria-expanded={menu}>
            {s.kind === 'ok' ? '✓' : '⚠'} {s.link.fileName}
          </button>
          {menu && (
            <span className="popover file-menu" role="dialog" aria-label="Linked file">
              <span className="small muted">Every save also goes to this file. Keep it in your OneDrive folder and OneDrive copies it to the cloud.</span>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  file.stop();
                }}
              >
                Stop saving to this file
              </button>
            </span>
          )}
        </span>
      );
  }
}

function StatusBar({ store, file }: { store: EditorStore; file: ReactNode }) {
  const project = useStore(store, (s) => s.project);
  const levelId = useStore(store, (s) => s.levelId);
  const pointer = useStore(store, (s) => s.pointer);
  const view = useStore(store, (s) => s.view);
  const [open, setOpen] = useState(false);
  const { open: warnings, acknowledged } = useMemo(() => splitWarnings(project, checkLayout(project).filter((w) => w.levelId === levelId)), [project, levelId]);
  const [showAck, setShowAck] = useState(false);
  const unit = project.settings.displayUnit;
  const counts = useMemo(() => {
    const onLevel = project.modules.filter((m) => m.levelId === levelId);
    const mods = onLevel.filter((m) => !isBase(m)).length;
    const bases = onLevel.filter(isBase).length + project.objects.filter((o) => o.levelId === levelId && o.type === 'footprint').length;
    const items = project.objects.filter((o) => o.levelId === levelId && o.type !== 'footprint').length;
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
    return [plural(mods, 'module'), bases ? plural(bases, 'feature') : '', items ? plural(items, 'item') : ''].filter(Boolean).join(' · ');
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
      {file}
      <span className="spacer" />
      <div className="warnings">
        <button
          type="button"
          className={warnings.length ? 'warn-btn has' : 'warn-btn'}
          onClick={() => setOpen(!open)}
          disabled={!warnings.length && !acknowledged.length}
        >
          {warnings.length ? `⚠ ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'No warnings'}
          {acknowledged.length > 0 && ` (${acknowledged.length} intended)`}
        </button>
        {open && (warnings.length > 0 || acknowledged.length > 0) && (
          <ul className="warn-list" role="list" aria-label="Warnings">
            {warnings.map((w) => (
              <li key={warningKey(w)}>
                <button type="button" className="link" onClick={() => show(w.ids)}>
                  {w.message}
                </button>
                {canAcknowledge(w) && (
                  <button
                    type="button"
                    title="Mark as intended: it stays recorded but stops counting as a warning"
                    onClick={() => store.getState().commit((p) => acknowledge(p, w))}
                  >
                    Intended
                  </button>
                )}
              </li>
            ))}
            {acknowledged.length > 0 && (
              <li className="ack-list">
                <button type="button" className="link" onClick={() => setShowAck(!showAck)}>
                  {showAck ? 'Hide' : 'Show'} {acknowledged.length} marked as intended
                </button>
              </li>
            )}
            {showAck &&
              acknowledged.map((w) => {
                const ack = project.acknowledgements.find((a) => a.key === warningKey(w));
                return (
                  <li key={warningKey(w)}>
                    <button type="button" className="link muted" onClick={() => show(w.ids)} title={ack ? `Marked ${new Date(ack.at).toLocaleString()}` : undefined}>
                      {w.message}
                    </button>
                    <button type="button" onClick={() => store.getState().commit((p) => unacknowledge(p, warningKey(w)))}>
                      Undo
                    </button>
                  </li>
                );
              })}
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
      if (mod && key === 'g') return handled(), e.shiftKey ? ungroupSelection(store) : groupSelection(store);
      if (mod) return;
      switch (e.key) {
        case 'ArrowLeft': return handled(), nudgeSelection(store, -big, 0);
        case 'ArrowRight': return handled(), nudgeSelection(store, big, 0);
        case 'ArrowUp': return handled(), nudgeSelection(store, 0, -big);
        case 'ArrowDown': return handled(), nudgeSelection(store, 0, big);
        case 'Delete':
        case 'Backspace': return handled(), deleteSelection(store);
        case 'Escape': return s.drag ? s.set({ drag: null }) : s.measure ? s.set({ measure: null }) : s.select([]);
      }
      if (key === 'r') return handled(), rotateSelection(store, e.shiftKey ? -1 : 1);
      if (key === 'f') return handled(), fitToLevel(store);
      if (key === 'v') return s.set({ mode: 'select', measure: null });
      if (key === 'h') return s.set({ mode: 'pan', measure: null });
      if (key === 'm') return s.set({ mode: 'measure' });
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

/** "2:41 PM" for today, otherwise "Oct 30, 2:41 PM", so an old save never looks fresh. */
function savedWhen(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}
