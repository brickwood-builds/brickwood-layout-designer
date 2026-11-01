import { useCallback, useEffect, useRef, useState } from 'react';
import { OverheadPreview } from './OverheadPreview';
import { HelpButton } from '../help/HelpDialog';
import { fileLinksSupported, pickOpenFile, type FileLinks } from '../storage/fileLink';
import { CheckpointsDialog, NewProjectDialog, RenameDialog } from './dialogs';
import { BackupControls } from './BackupDialogs';
import { formatDate, summary, tableSize } from './format';
import { exportFileName, exportProject, parseProjectFile } from '../domain/exchange';
import { ProjectFormatError } from '../domain/migrations';
import { projectStats } from '../domain/project';
import type { Project } from '../domain/schema';
import type { DamagedProject, ProjectRepository } from '../storage/repository';

type DialogState =
  | { kind: 'new' }
  | { kind: 'rename'; project: Project }
  | { kind: 'checkpoints'; id: string; name: string }
  | null;

export function Dashboard({ repo, links, onOpen }: { repo: ProjectRepository; links: FileLinks; onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [damaged, setDamaged] = useState<DamagedProject[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const r = await repo.listProjects({ includeArchived: showArchived });
    setProjects(r.projects);
    setDamaged(r.damaged);
  }, [repo, showArchived]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from IndexedDB on mount
    refresh();
  }, [refresh]);

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) setMessage({ text: success });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    }
    await refresh();
  };

  const download = (p: Project) => {
    const blob = new Blob([exportProject(p)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(p);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ text: `Exported “${p.name}” to ${a.download}` });
  };

  const importFile = async (file: File) => {
    try {
      const project = parseProjectFile(await file.text());
      const r = await repo.importProject(project);
      setMessage({
        text: r.importedAsCopy
          ? `“${project.name}” already exists here, so it was imported as a copy: “${r.project.name}”.`
          : `Imported “${r.project.name}”.`,
      });
    } catch (e) {
      const details = e instanceof ProjectFormatError && e.details.length ? ` (${e.details.slice(0, 3).join('; ')})` : '';
      setMessage({ text: `Could not import ${file.name}: ${(e as Error).message}${details}`, error: true });
    }
    await refresh();
  };

  /** Open a project's file (e.g. from the OneDrive folder) and keep saving to it. */
  const openFile = async () => {
    try {
      const handle = await pickOpenFile();
      const fromFile = parseProjectFile(await (await handle.getFile()).text());
      const local = await repo.getProject(fromFile.id).catch(() => null);
      let project = fromFile;
      if (!local) project = await repo.createProject({ ...fromFile, archived: false });
      else if (local.revisionId !== fromFile.revisionId) {
        // The file wins (the user opened it); this computer's copy is kept as a checkpoint.
        project = await repo.replaceWithVersion(fromFile, 'Before opening the version from its file', { keepRevisionId: true });
      }
      await links.adopt(project, handle);
      onOpen(project.id);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const details = e instanceof ProjectFormatError && e.details.length ? ` (${e.details.slice(0, 3).join('; ')})` : '';
      setMessage({ text: `Could not open that file: ${(e as Error).message}${details}`, error: true });
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1>Brickwood Layout Designer</h1>
        <div className="topbar-actions">
          <button type="button" className="primary" onClick={() => setDialog({ kind: 'new' })}>
            New project
          </button>
          {fileLinksSupported() && (
            <button type="button" onClick={openFile} title="Open a project file (for example from your OneDrive folder) and keep saving to it">
              Open file…
            </button>
          )}
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import…
          </button>
          <HelpButton context="dashboard" />
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importFile(f);
            }}
          />
        </div>
      </header>

      {message && (
        <div className={message.error ? 'banner error' : 'banner'} role={message.error ? 'alert' : 'status'}>
          <span>{message.text}</span>
          <button type="button" className="icon" aria-label="Dismiss" onClick={() => setMessage(null)}>
            ×
          </button>
        </div>
      )}

      {projects && <BackupControls repo={repo} projects={projects} onDone={async (text, error) => (setMessage({ text, error }), await refresh())} />}

      {damaged.map((d) => (
        <div className="banner error" role="alert" key={d.id}>
          <span>
            A saved project could not be read ({d.error}).{' '}
            {d.hasCheckpoint ? 'You can restore it from a checkpoint.' : 'No checkpoint is available; restore it from an exported file.'}
          </span>
          {d.hasCheckpoint && (
            <button type="button" onClick={() => setDialog({ kind: 'checkpoints', id: d.id, name: 'Damaged project' })}>
              Restore…
            </button>
          )}
        </div>
      ))}

      <main className="cards" aria-label="Projects">
        {projects?.length === 0 && <p className="muted">No projects yet. Choose New project to start.</p>}
        {projects?.map((p) => (
          <article className={p.archived ? 'card archived' : 'card'} key={p.id} aria-label={p.name}>
            <button type="button" className="card-preview" onClick={() => onOpen(p.id)} aria-label={`Open ${p.name}`}>
              <OverheadPreview project={p} />
            </button>
            <div className="card-body">
              <h2>{p.name}</h2>
              <p className="muted">
                {summary(projectStats(p))}
                <br />
                {tableSize(p)} · edited {formatDate(p.updatedAt)}
                {p.archived && ' · archived'}
              </p>
            </div>
            <div className="card-actions">
              <button type="button" className="primary" onClick={() => onOpen(p.id)}>
                Open
              </button>
              <details className="menu">
                <summary>More</summary>
                <div className="menu-items" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open')}>
                  <button type="button" onClick={() => setDialog({ kind: 'rename', project: p })}>Rename…</button>
                  <button type="button" onClick={() => run(() => repo.duplicate(p.id), `Duplicated “${p.name}”.`)}>Duplicate</button>
                  <button type="button" onClick={() => download(p)}>Export file</button>
                  <button type="button" onClick={() => setDialog({ kind: 'checkpoints', id: p.id, name: p.name })}>Checkpoints…</button>
                  <button
                    type="button"
                    onClick={() => run(() => repo.setArchived(p.id, !p.archived), p.archived ? `Restored “${p.name}”.` : `Archived “${p.name}”.`)}
                  >
                    {p.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              </details>
            </div>
          </article>
        ))}
      </main>

      <footer className="statusbar">
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <span className="muted">Saved in this browser. Export files to keep a backup.</span>
      </footer>

      {dialog?.kind === 'new' && (
        <NewProjectDialog
          onClose={() => setDialog(null)}
          onCreate={async (project) => {
            setDialog(null);
            await run(() => repo.createProject(project), `Created “${project.name}”.`);
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
            refresh();
          }}
        />
      )}
    </div>
  );
}
