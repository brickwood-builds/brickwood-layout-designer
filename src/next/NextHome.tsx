// The projects screen. Big cards with a picture of each layout; New, Open a file, Import, and
// backups along the top; each card's ⋯ menu for rename, duplicate, export, checkpoints, archive.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Project } from '../domain/schema';
import { createProject } from '../domain/project';
import { exportFileName, exportProject, parseProjectFile } from '../domain/exchange';
import { ProjectFormatError } from '../domain/migrations';
import type { DamagedProject, ProjectRepository } from '../storage/repository';
import { fileLinksSupported, pickOpenFile, type FileLinks } from '../storage/fileLink';
import { OverheadPreview } from '../ui/OverheadPreview';
import { formatDate, tableSize } from '../ui/format';
import { CheckpointsDialog, RenameDialog } from '../ui/dialogs';
import { BackupControls } from '../ui/BackupDialogs';
import { CloudBar } from '../ui/CloudBar';
import { cloud } from '../cloud/service';
import { bringInFromTrial, trialLayouts } from './NextApp';
import { Icon } from './icons';

type Dialog = { kind: 'rename'; project: Project } | { kind: 'checkpoints'; id: string; name: string } | null;

export function NextHome({ repo, links, onOpen }: { repo: ProjectRepository; links: FileLinks; onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [damaged, setDamaged] = useState<DamagedProject[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [fromTrial, setFromTrial] = useState<Awaited<ReturnType<typeof trialLayouts>>>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await repo.listProjects({ includeArchived: showArchived });
    setProjects(r.projects.sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || b.updatedAt.localeCompare(a.updatedAt)));
    setDamaged(r.damaged);
  }, [repo, showArchived]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from IndexedDB on mount
    void load();
  }, [load]);
  useEffect(() => {
    void trialLayouts().then(setFromTrial, () => undefined);
  }, []);
  // Layouts arriving from another device (OneDrive) show up straight away.
  useEffect(() => cloud()?.onTaken(() => void load()), [load]);
  // A card's menu closes on the next click anywhere.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const t = setTimeout(() => window.addEventListener('click', close, { once: true }));
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', close);
    };
  }, [menu]);

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      cloud()?.syncSoon();
      if (success) setMessage({ text: success });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    }
    await load();
  };

  const download = (p: Project) => {
    const url = URL.createObjectURL(new Blob([exportProject(p)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(p);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ text: `Saved “${p.name}” as ${a.download}` });
  };

  const importFile = async (file: File) => {
    try {
      const project = parseProjectFile(await file.text());
      const r = await repo.importProject(project);
      setMessage({ text: r.importedAsCopy ? `“${project.name}” is already here, so it came in as a copy: “${r.project.name}”.` : `Imported “${r.project.name}”.` });
    } catch (e) {
      const details = e instanceof ProjectFormatError && e.details.length ? ` (${e.details.slice(0, 3).join('; ')})` : '';
      setMessage({ text: `Couldn’t import ${file.name}: ${(e as Error).message}${details}`, error: true });
    }
    await load();
  };

  /** Open a layout's file (e.g. in the OneDrive folder) and keep saving to it. */
  const openFile = async () => {
    try {
      const handle = await pickOpenFile();
      const fromFile = parseProjectFile(await (await handle.getFile()).text());
      const local = await repo.getProject(fromFile.id).catch(() => null);
      let project = fromFile;
      if (!local) project = await repo.createProject({ ...fromFile, archived: false });
      else if (local.revisionId !== fromFile.revisionId) project = await repo.replaceWithVersion(fromFile, 'Before opening the version from its file', { keepRevisionId: true });
      await links.adopt(project, handle);
      onOpen(project.id);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setMessage({ text: `Couldn’t open that file: ${(e as Error).message}`, error: true });
    }
  };

  return (
    <div className="nx nx-home">
      <header className="nx-home-head">
        <h1>Your layouts</h1>
        <div className="nx-row nx-wrap">
          {fileLinksSupported() && (
            <button type="button" className="nx-btn" onClick={() => void openFile()} title="Open a layout file (for example in your OneDrive folder) and keep saving to it">
              Open a file…
            </button>
          )}
          <button type="button" className="nx-btn" onClick={() => fileInput.current?.click()} title="Bring in a layout from a file (a copy)">
            <Icon name="download" /> Import
          </button>
          <button type="button" className="nx-btn nx-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New layout
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
      </header>
      {message && (
        <p className={`nx-note ${message.error ? 'nx-note-error' : ''}`} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <div className="nx-cloud">
        <CloudBar onChanged={() => void load()} />
        {projects && <BackupControls repo={repo} projects={projects} onDone={async (text, error) => (setMessage({ text, error }), await load())} />}
      </div>
      {fromTrial.length > 0 && (
        <div className="nx-note nx-row" role="status">
          <span className="nx-grow">
            You changed {fromTrial.length === 1 ? <strong>{fromTrial[0]!.name}</strong> : `${fromTrial.length} layouts`} in the trial page after the copy here. Bring {fromTrial.length === 1 ? 'it' : 'them'} in? (The version here is kept as a checkpoint.)
          </span>
          <button
            type="button"
            className="nx-btn nx-primary"
            onClick={async () => {
              const n = await bringInFromTrial(fromTrial.map((t) => t.id));
              setFromTrial([]);
              setMessage({ text: `Brought in ${n} layout${n === 1 ? '' : 's'} from the trial.` });
              await load();
            }}
          >
            Bring in
          </button>
          <button type="button" className="nx-btn" onClick={() => setFromTrial([])}>
            Not now
          </button>
        </div>
      )}
      {damaged.map((d) => (
        <div className="nx-note nx-note-error nx-row" role="alert" key={d.id}>
          <span className="nx-grow">
            A saved layout couldn’t be read ({d.error}). {d.hasCheckpoint ? 'It can be restored from a checkpoint.' : 'No checkpoint is available; import it from a saved file.'}
          </span>
          {d.hasCheckpoint && (
            <button type="button" className="nx-btn" onClick={() => setDialog({ kind: 'checkpoints', id: d.id, name: 'Damaged layout' })}>
              Restore…
            </button>
          )}
        </div>
      ))}
      <div className="nx-cards" aria-label="Layouts">
        {projects?.length === 0 && <p className="nx-muted">No layouts yet. Choose New layout to start.</p>}
        {projects?.map((p) => (
          <div key={p.id} className={`nx-card-wrap ${p.archived ? 'nx-archived' : ''}`}>
            <button type="button" className="nx-card" onClick={() => onOpen(p.id)} aria-label={`Open ${p.name}`}>
              <div className="nx-card-pic">
                <OverheadPreview project={p} />
              </div>
              <div className="nx-card-text">
                <strong>
                  {p.name}
                  {p.archived && <span className="nx-muted"> · archived</span>}
                </strong>
                <span className="nx-muted">
                  {tableSize(p)} · {formatDate(p.updatedAt)}
                </span>
              </div>
            </button>
            <div className="nx-card-menu">
              <button
                type="button"
                className="nx-icon-btn"
                aria-label={`More for ${p.name}`}
                aria-expanded={menu === p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(menu === p.id ? null : p.id);
                }}
              >
                <Icon name="more" />
              </button>
              {menu === p.id && (
                <div className="nx-pop" role="menu" aria-label={`${p.name} menu`}>
                  <button type="button" role="menuitem" className="nx-menu-item" onClick={() => setDialog({ kind: 'rename', project: p })}>
                    Rename…
                  </button>
                  <button type="button" role="menuitem" className="nx-menu-item" onClick={() => void run(() => repo.duplicate(p.id), `Duplicated “${p.name}”.`)}>
                    Duplicate
                  </button>
                  <button type="button" role="menuitem" className="nx-menu-item" onClick={() => download(p)}>
                    Save as a file
                  </button>
                  <button type="button" role="menuitem" className="nx-menu-item" onClick={() => setDialog({ kind: 'checkpoints', id: p.id, name: p.name })}>
                    Checkpoints (earlier versions)…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="nx-menu-item"
                    onClick={() => void run(() => repo.setArchived(p.id, !p.archived), p.archived ? `Restored “${p.name}”.` : `Archived “${p.name}” (hidden; tick Show archived to find it).`)}
                  >
                    {p.archived ? 'Unarchive' : 'Archive (hide)'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <label className="nx-row nx-show-archived">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        <span className="nx-muted">Show archived layouts</span>
      </label>
      <p className="nx-muted">
        Saved in this browser{cloud()?.state.signedIn ? ' and in your OneDrive' : ''}. The <a href="./classic.html">classic version</a> works on the same layouts.
      </p>
      {creating && (
        <NewLayout
          onClose={() => setCreating(false)}
          onCreate={async (name, w, d) => {
            const p = createProject({ name, table: { widthIn: w, depthIn: d } });
            await repo.createProject(p);
            cloud()?.syncSoon();
            onOpen(p.id);
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          project={dialog.project}
          onClose={() => setDialog(null)}
          onRename={async (name) => {
            setDialog(null);
            await run(() => repo.rename(dialog.project.id, name), 'Renamed.');
          }}
        />
      )}
      {dialog?.kind === 'checkpoints' && (
        <CheckpointsDialog
          repo={repo}
          projectId={dialog.id}
          projectName={dialog.name}
          onClose={() => setDialog(null)}
          onRestored={() => {
            setDialog(null);
            setMessage({ text: 'Checkpoint restored.' });
            void load();
          }}
        />
      )}
    </div>
  );
}

function NewLayout({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, w: number, d: number) => void }) {
  const [name, setName] = useState('');
  const [w, setW] = useState(96);
  const [d, setD] = useState(42);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && w > 0 && d > 0) onCreate(name.trim(), w, d);
  };
  return (
    <div className="nx-scrim" onClick={onClose}>
      <form className="nx-sheet" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label="New layout">
        <h2>New layout</h2>
        <label className="nx-field">
          <span>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Winter show" />
        </label>
        <div className="nx-row">
          <label className="nx-field">
            <span>Table width (in)</span>
            <input type="number" min={1} value={w} onChange={(e) => setW(Number(e.target.value))} />
          </label>
          <label className="nx-field">
            <span>Table depth (in)</span>
            <input type="number" min={1} value={d} onChange={(e) => setD(Number(e.target.value))} />
          </label>
        </div>
        <p className="nx-muted">You can change the table, or make it an L, U or ring, later.</p>
        <div className="nx-row nx-end">
          <button type="button" className="nx-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="nx-btn nx-primary" disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
