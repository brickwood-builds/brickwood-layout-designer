// Trial interface: the editor. The idea is that the layout fills the screen and the controls
// come to you:
//  • a slim bar along the top (back, name, undo/redo, warnings, view, more);
//  • a library on the left to add things (search, a few kinds, pick → click to place);
//  • a small floating bar next to whatever is selected (turn, copy, shape, delete, details);
//  • a details card only when asked for;
//  • the tools in a dock at the bottom, with one line saying what a click does now.
// Underneath it is the same editor as the app (canvas, store, saving, undo, keyboard).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ProjectRepository } from '../storage/repository';
import { createEditorStore, type EditorStore } from '../editor/store';
import { startAutosave, type Autosave } from '../editor/autosave';
import { Canvas } from '../editor/Canvas';
import { Properties } from '../editor/Panels';
import { LayersMenu } from '../editor/LayersMenu';
import { FileStatus, LevelControls, LevelDialog, useFlushWhenHidden, useKeyboard } from '../editor/Editor';
import { useFileSync } from '../editor/fileSync';
import type { FileLinks } from '../storage/fileLink';
import type { Project } from '../domain/schema';
import { duplicateProject } from '../domain/project';
import { computeStack } from '../domain/heights';
import { cloud } from '../cloud/service';
import { CloudChip } from '../ui/CloudBar';
import { HeightFilter, HeightShadingToggle, OptionsMenu } from '../editor/OptionsMenu';
import { PartsListButton } from '../editor/PartsList';
import { VersionsButton } from '../editor/Versions';
import { BuildsButton, BuildsDialog } from '../editor/Builds';
import { PackingButton, PackingDialog } from '../editor/Packing';
import { ShowsButton, ShowsDialog } from '../editor/Shows';
import { SetupButton, SetupDialog } from '../editor/Setup';
import { ERASE_SHAPES } from '../editor/drawTool';
import {
  copySelection,
  pasteAt,
  selectAll,
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
import { toScreen, toWorld } from '../editor/view';
import { itemAt } from '../domain/hit';
import { expandToGroups } from '../domain/objects';
import { NextLibrary } from './NextLibrary';
import { HelpButton } from '../help/HelpDialog';
import { NEXT_HELP_START, NEXT_HELP_TOPICS } from './help';
import { DrawCard, EraseCard, ShapeCard } from './NextToolCards';
import { Icon } from './icons';

type OnSaved = (p: Project) => void;

export function NextEditor({ repo, links, id, box, onBack }: { repo: ProjectRepository; links: FileLinks; id: string; box?: string; onBack: () => void }) {
  const [loaded, setLoaded] = useState<{ store: EditorStore; autosave: Autosave; registerOnSaved: (fn: OnSaved) => void } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let autosave: Autosave | undefined;
    let cancelled = false;
    repo.getProject(id).then(
      (p) => {
        if (cancelled) return;
        const store = createEditorStore(p);
        // Lets the linked-file sync hear about each save; OneDrive sends it shortly after.
        let onSaved: OnSaved | undefined;
        autosave = startAutosave(store, repo, 600, (saved) => {
          onSaved?.(saved);
          cloud()?.syncSoon();
        });
        setLoaded({ store, autosave, registerOnSaved: (fn) => (onSaved = fn) });
      },
      (e: Error) => setError(e.message),
    );
    return () => {
      cancelled = true;
      if (autosave) autosave.flush().finally(() => autosave!.stop());
    };
  }, [repo, id]);
  // A box label's QR code: show that box (lookup only — nothing is ticked off).
  useEffect(() => {
    if (!loaded || !box) return;
    const s = loaded.store.getState();
    const c = s.project.containers.find((x) => x.code.toLowerCase() === box.toLowerCase());
    s.set({ packingDialog: c ? c.id : 'list' });
  }, [loaded, box]);
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
  return <Screen store={loaded.store} autosave={loaded.autosave} repo={repo} links={links} registerOnSaved={loaded.registerOnSaved} onBack={onBack} />;
}

function Screen({ store, autosave, repo, links, registerOnSaved, onBack }: { store: EditorStore; autosave: Autosave; repo: ProjectRepository; links: FileLinks; registerOnSaved: (fn: OnSaved) => void; onBack: () => void }) {
  useKeyboard(store);
  useFlushWhenHidden(autosave);
  const file = useFileSync(store, repo, links, autosave, registerOnSaved);
  // On a narrow screen (an iPad upright) the library sits over the layout: it starts closed,
  // and gets out of the way as soon as something is picked from it.
  const narrow = () => window.innerWidth <= 900;
  const [library, setLibrary] = useState(() => !narrow());
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        const shape = (x: typeof s) => x.mode === 'draw' && x.draw.shape === 'outline';
        if (narrow() && ((s.holding && s.holding !== prev.holding) || (shape(s) && !shape(prev)))) setLibrary(false);
      }),
    [store],
  );
  const [details, setDetails] = useState(false);
  /** Right-click menu: where on screen (in the layout area) and where on the table. */
  const [menu, setMenu] = useState<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  const longPress = useRef<{ start: { x: number; y: number }; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current.timer);
    longPress.current = null;
  };
  const openMenu = (cx: number, cy: number, r: DOMRect) => {
    const s = store.getState();
    const x = cx - r.left;
    const y = cy - r.top;
    const world = toWorld(s.view, x, y);
    // Right-clicking something picks it (unless it's already part of what's selected).
    const hit = s.mode === 'select' ? itemAt(s.project, s.levelId, world.x, world.y, undefined, 6 / s.view.scale) : null;
    if (hit && !s.selection.includes(hit.id)) s.select(expandToGroups(s.project, [hit.id]));
    if (!hit && s.mode === 'select') s.select([]);
    setMenu({ x, y, world });
  };
  const mode = useStore(store, (s) => s.mode);
  const selection = useStore(store, (s) => s.selection);
  // Fit the table into view once the canvas has its size.
  const viewport = useStore(store, (s) => s.viewport.width);
  useEffect(() => {
    if (viewport) fitToLevel(store);
    // Only when the canvas first gets its size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport > 0]);
  // Draw, Erase, drawing a shape and Measure have settings: a card while the tool is on.
  const erase = useStore(store, (s) => s.draw.erase);
  const drawShape = useStore(store, (s) => s.draw.shape);
  const toolCard =
    mode === 'measure' ? (
      <aside className="nx-card-panel nx-tool-card" aria-label="Measure">
        <Properties store={store} />
      </aside>
    ) : mode === 'draw' ? (
      drawShape === 'outline' ? <ShapeCard store={store} /> : erase ? <EraseCard store={store} /> : <DrawCard store={store} />
    ) : null;

  return (
    <div className="nx nx-editor">
      <TopBar
        store={store}
        repo={repo}
        autosave={autosave}
        file={file}
        library={library}
        onLibrary={() => setLibrary(!library)}
        onBack={async () => {
          await autosave.flush();
          onBack();
        }}
      />
      <Banners store={store} repo={repo} autosave={autosave} file={file} />
      <div className="nx-body">
        {library && <NextLibrary store={store} onClose={() => setLibrary(false)} />}
        <div
          className="nx-stage"
          onContextMenu={(e) => openMenu(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => {
            // iPad: a long press (holding still) opens the same menu as a right-click.
            if (e.pointerType !== 'touch') return;
            const r = e.currentTarget.getBoundingClientRect();
            const start = { x: e.clientX, y: e.clientY };
            longPress.current = { start, timer: setTimeout(() => openMenu(start.x, start.y, r), 550) };
          }}
          onPointerMove={(e) => {
            const lp = longPress.current;
            if (lp && Math.hypot(e.clientX - lp.start.x, e.clientY - lp.start.y) > 10) cancelLongPress();
          }}
          onPointerUp={cancelLongPress}
          onPointerCancel={cancelLongPress}
        >
          <Canvas store={store} />
          {menu && <ContextMenu store={store} at={menu} onClose={() => setMenu(null)} onDetails={() => setDetails(true)} />}
          {mode === 'select' && selection.length > 0 && <SelectionBar store={store} details={details} onDetails={() => setDetails(!details)} />}
          <Dock store={store} />
          <Hint store={store} />
          <Zoom store={store} />
          <SetupDialog store={store} />
          <PackingDialog store={store} />
          <ShowsDialog store={store} />
          <BuildsDialog store={store} repo={repo} />
          {toolCard ?? (
            details && selection.length > 0 && <DetailsCard store={store} onClose={() => setDetails(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Slim bar: back, name (click to rename), undo/redo, warnings, view and more. */
function TopBar({
  store,
  repo,
  autosave,
  file,
  library,
  onLibrary,
  onBack,
}: {
  store: EditorStore;
  repo: ProjectRepository;
  autosave: Autosave;
  file: ReturnType<typeof useFileSync>;
  library: boolean;
  onLibrary: () => void;
  onBack: () => void;
}) {
  const project = useStore(store, (s) => s.project);
  const levelId = useStore(store, (s) => s.levelId);
  const canUndo = useStore(store, (s) => s.past.length > 0);
  const canRedo = useStore(store, (s) => s.future.length > 0);
  const saveState = useStore(store, (s) => s.saveState);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<'warnings' | 'more' | 'plan' | null>(null);
  const features = project.features;
  const maxTop = useMemo(() => (features.heights ? Math.max(0, ...[...computeStack(project, levelId).values()].map((i) => i.top)) : 0), [project, levelId, features.heights]);
  // Help opens on the topic for what you're doing.
  const mode = useStore(store, (s) => s.mode);
  const drawShape = useStore(store, (s) => s.draw.shape);
  const erasing = useStore(store, (s) => s.draw.erase);
  const holding = useStore(store, (s) => !!s.holding);
  const helpStart =
    mode === 'measure' ? NEXT_HELP_START.measure : mode === 'draw' ? (drawShape === 'outline' ? NEXT_HELP_START.shape : erasing ? NEXT_HELP_START.erase : NEXT_HELP_START.draw) : holding ? NEXT_HELP_START.placing : NEXT_HELP_START.editor;
  const go = async (hash: string) => {
    await autosave.flush();
    window.location.hash = hash;
  };
  const [tableDialog, setTableDialog] = useState<'edit' | 'add' | null>(null);
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
      <CloudChip />
      <div className="nx-grow" />
      {project.levels.length > 1 && <LevelControls store={store} />}
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
        <button type="button" className="nx-btn" aria-expanded={menu === 'plan'} onClick={() => setMenu(menu === 'plan' ? null : 'plan')} title="Parts list, versions, builds, packing, shows, heights — and switching them on">
          Plan
        </button>
        {menu === 'plan' && (
          <div className="nx-pop nx-plan" role="dialog" aria-label="Plan">
            <div className="nx-plan-tools">
              {features.inventory && <PartsListButton store={store} repo={repo} />}
              {features.versions && <VersionsButton store={store} repo={repo} autosave={autosave} />}
              {features.builds && <BuildsButton store={store} />}
              {features.transport && <PackingButton store={store} />}
              {features.exhibitions && <ShowsButton store={store} />}
              {features.helpers && <SetupButton store={store} />}
              {features.heights && <HeightShadingToggle store={store} maxTop={maxTop} />}
              {features.heights && <HeightFilter store={store} maxTop={maxTop} />}
            </div>
            {!(features.inventory || features.versions || features.builds || features.transport || features.exhibitions || features.helpers || features.heights) && (
              <p className="nx-muted">Planning tools — parts list and shopping, versions, builds, packing, shows, heights — are switched on per layout, so a layout stays simple until you need them.</p>
            )}
            <OptionsMenu store={store} label="Choose tools…" />
          </div>
        )}
      </div>
      <HelpButton topics={NEXT_HELP_TOPICS} start={helpStart} className="nx-icon-btn nx-help" label="?" />
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
                setTableDialog('edit');
                setMenu(null);
              }}
            >
              <Icon name="table" /> Table shape and size…
            </button>
            <button type="button" className="nx-menu-item" onClick={() => void go(`#/project/${project.id}/print`)}>
              <Icon name="print" /> Print, PDF and pictures…
            </button>
            {features.builds || features.exhibitions || features.inventory ? (
              <button type="button" className="nx-menu-item" onClick={() => void go(`#/project/${project.id}/report`)}>
                <Icon name="info" /> Display report…
              </button>
            ) : null}
            <div className="nx-menu-file">
              <FileStatus file={file} />
            </div>
            <a className="nx-menu-item" href={`./classic.html#/project/${project.id}`} onClick={() => void autosave.flush()} title="The same layout in the classic version, for anything not here yet">
              <Icon name="back" /> Open in the classic version
            </a>
          </div>
        )}
      </div>
      {tableDialog && (
        <LevelDialog
          key={tableDialog}
          store={store}
          levelId={tableDialog === 'edit' ? levelId : null}
          onAddLevel={() => setTableDialog('add')}
          onClose={() => setTableDialog(null)}
          onCreated={(id) => {
            // A new level (e.g. a shelf above the table): go to it.
            setTableDialog(null);
            store.getState().set({ levelId: id });
            store.getState().select([]);
            fitToLevel(store);
          }}
        />
      )}
    </header>
  );
}

/** The same warnings as the classic version: changed on another device, in another tab, file trouble, not saved. */
function Banners({ store, repo, autosave, file }: { store: EditorStore; repo: ProjectRepository; autosave: Autosave; file: ReturnType<typeof useFileSync> }) {
  const saveState = useStore(store, (s) => s.saveState);
  const saveError = useStore(store, (s) => s.saveError);
  const project = useStore(store, (s) => s.project);
  const [updatedElsewhere, setUpdatedElsewhere] = useState(false);
  useEffect(() => {
    const c = cloud();
    if (!c) return;
    const offBefore = c.addBeforeSync(() => autosave.flush());
    const offTaken = c.onTaken((ids) => ids.includes(store.getState().project.id) && setUpdatedElsewhere(true));
    return () => {
      offBefore();
      offTaken();
    };
  }, [autosave, store]);
  return (
    <>
      {updatedElsewhere && (
        <div className="banner" role="alert">
          <span>This layout was updated from your other device (OneDrive). Your copy from before is kept as a checkpoint.</span>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Load the update
          </button>
        </div>
      )}
      {saveState === 'conflict' && (
        <div className="banner error" role="alert">
          <span>This layout was changed in another tab or window, so your latest changes here were not saved.</span>
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
            <button type="button" onClick={() => window.location.reload()}>
              Reload latest
            </button>
          </span>
        </div>
      )}
      {file.state.kind === 'changed' && (
        <div className="banner error" role="alert">
          <span>
            <strong>{file.state.link.fileName}</strong> was changed somewhere else (probably on another computer), so this version wasn’t saved to it. Whichever you don’t pick is kept as a checkpoint.
          </span>
          <span className="banner-actions">
            <button type="button" onClick={() => file.useFileVersion()}>
              Use the file’s version
            </button>
            <button type="button" onClick={() => file.keepThisVersion()}>
              Keep this version
            </button>
          </span>
        </div>
      )}
      {file.state.kind === 'error' && (
        <div className="banner error" role="alert">
          <span>
            Couldn’t save to <strong>{file.state.link.fileName}</strong>: {file.state.message}
          </span>
          <span className="banner-actions">
            <button type="button" onClick={() => file.writeNow()}>
              Try again
            </button>
            <button type="button" onClick={() => file.stop()}>
              Stop saving to the file
            </button>
          </span>
        </div>
      )}
      {saveState === 'error' && (
        <div className="banner error" role="alert">
          <span>Could not save: {saveError}. Your next change will try again; export a copy if this keeps happening.</span>
        </div>
      )}
    </>
  );
}

/** Right-click menu: the usual actions for what's under the pointer, or for the table. */
function ContextMenu({ store, at, onClose, onDetails }: { store: EditorStore; at: { x: number; y: number; world: { x: number; y: number } }; onClose: () => void; onDetails: () => void }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const clipboard = useStore(store, (s) => s.clipboard.length);
  const viewport = useStore(store, (s) => s.viewport);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      onClose();
    };
    // On the next tick, so the right-click that opened it doesn't close it.
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', close);
      window.addEventListener('keydown', close);
      window.addEventListener('wheel', close, { passive: true });
    });
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);
  const items = allItems(project).filter((i) => selection.includes(i.id));
  const one = items.length === 1 ? items[0]! : null;
  const grouped = selection.some((id) => groupOf(project, id));
  const run = (f: () => void) => () => {
    f();
    onClose();
  };
  const rows: [string, string, string | null, () => void][] = [];
  if (items.length) {
    rows.push(['rotate', 'Turn a quarter', 'R', () => rotateSelection(store, 1)]);
    rows.push(['turn', 'Turn 5°', 'Shift+]', () => turnSelection(store, 5)]);
    rows.push(['copy', 'Duplicate', 'Ctrl+D', () => duplicateSelection(store)]);
    rows.push(['copy', 'Copy', 'Ctrl+C', () => copySelection(store)]);
    if (one && canEditShape(one)) rows.push(['shape', 'Edit shape', null, () => store.getState().set({ editingPath: one.id })]);
    if (items.length > 1 && !grouped) rows.push(['group', 'Group', 'Ctrl+G', () => groupSelection(store)]);
    if (grouped) rows.push(['group', 'Ungroup', 'Ctrl+Shift+G', () => ungroupSelection(store)]);
    rows.push(['info', 'Details', null, onDetails]);
  }
  if (clipboard) rows.push(['copy', 'Paste here', null, () => pasteAt(store, at.world)]);
  if (!items.length) {
    rows.push(['cursor', 'Select all', 'Ctrl+A', () => selectAll(store)]);
    rows.push(['fit', 'Show the whole table', 'F', () => fitToLevel(store)]);
  }
  const height = rows.length * 36 + (items.length ? 46 : 12);
  const left = Math.min(at.x, viewport.width - 230);
  const top = Math.min(at.y, viewport.height - height - 8);
  return (
    <div className="nx-pop nx-context" style={{ left, top, right: 'auto' }} role="menu" aria-label="Actions" onPointerDown={(e) => e.stopPropagation()}>
      {rows.map(([icon, label, keys, f]) => (
        <button key={label} type="button" role="menuitem" className="nx-menu-item" onClick={run(f)}>
          <Icon name={icon} /> <span className="nx-grow">{label}</span>
          {keys && <span className="nx-keys">{keys}</span>}
        </button>
      ))}
      {items.length > 0 && (
        <button type="button" role="menuitem" className="nx-menu-item nx-danger" onClick={run(() => deleteSelection(store))}>
          <Icon name="trash" /> <span className="nx-grow">Delete</span>
          <span className="nx-keys">Del</span>
        </button>
      )}
    </div>
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
  const drawShape = useStore(store, (s) => s.draw.shape);
  const holding = useStore(store, (s) => s.holding);
  const editing = useStore(store, (s) => !!s.editingPath && s.selection.includes(s.editingPath));
  let text: ReactNode = null;
  if (holding)
    text = (
      <>
        <strong>{holding.label}</strong> — {holding.hint ?? 'click (or tap) where each one goes'}
        <button type="button" className="nx-link" onClick={() => store.getState().set({ holding: null })}>
          Done
        </button>
      </>
    );
  else if (editing) text = 'Drag a corner to move it · drag a + to add one · double-click a corner to remove it · Esc when done';
  else if (mode === 'draw' && drawShape === 'outline') text = 'Click each corner, all the way round · Finish shape when done · Esc to stop';
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
