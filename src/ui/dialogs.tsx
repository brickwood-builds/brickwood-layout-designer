import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { OverheadPreview } from './OverheadPreview';
import { createProject, duplicateProject, projectStats } from '../domain/project';
import type { Project } from '../domain/schema';
import type { CheckpointInfo, ProjectRepository } from '../storage/repository';
import { starterProjects } from '../starters';
import { formatDate, summary } from './format';

export function NewProjectDialog({ onCreate, onClose }: { onCreate: (p: Project) => Promise<void>; onClose: () => void }) {
  // The Visio displays (Development is just an empty table, offered as "Empty table").
  const starters = starterProjects().filter((s) => s.project.origin !== 'starter:development');
  const [start, setStart] = useState('blank');
  const [name, setName] = useState('');
  const [widthIn, setWidthIn] = useState(96);
  const [depthIn, setDepthIn] = useState(42);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const starter = starters.find((s) => s.project.origin === start);
    const project = starter
      ? duplicateProject(starter.project, name.trim() || starter.project.name)
      : createProject({ name: name.trim() || 'New display', table: { widthIn, depthIn } });
    await onCreate(project);
  };

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="New display" maxLength={120} />
        </label>
        <fieldset>
          <legend>Start from</legend>
          <label className="radio">
            <input type="radio" name="start" value="blank" checked={start === 'blank'} onChange={() => setStart('blank')} />
            Empty table
          </label>
          {starters.map((s) => (
            <label className="radio" key={s.project.id}>
              <input
                type="radio"
                name="start"
                value={s.project.origin}
                checked={start === s.project.origin}
                onChange={() => setStart(s.project.origin!)}
              />
              {s.project.name}
            </label>
          ))}
        </fieldset>
        {start === 'blank' && (
          <div className="row">
            <label>
              Table width (in)
              <input type="number" min={6} max={2000} value={widthIn} onChange={(e) => setWidthIn(Number(e.target.value))} required />
            </label>
            <label>
              Table depth (in)
              <input type="number" min={6} max={2000} value={depthIn} onChange={(e) => setDepthIn(Number(e.target.value))} required />
            </label>
          </div>
        )}
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>Create</button>
        </footer>
      </form>
    </Modal>
  );
}

export function RenameDialog({ project, onRename, onClose }: { project: Project; onRename: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  return (
    <Modal title="Rename project" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim()) await onRename(name);
        }}
      >
        <label>
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </label>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!name.trim()}>Rename</button>
        </footer>
      </form>
    </Modal>
  );
}

/** Recovery checkpoints: pick one, preview it, then restore. */
export function CheckpointsDialog({
  repo,
  projectId,
  projectName,
  onRestored,
  onClose,
}: {
  repo: ProjectRepository;
  projectId: string;
  projectName: string;
  onRestored: () => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<CheckpointInfo[] | null>(null);
  const [selected, setSelected] = useState<{ info: CheckpointInfo; project: Project } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    repo.listCheckpoints(projectId).then(setList, (e: Error) => setError(e.message));
  }, [repo, projectId]);

  const choose = async (info: CheckpointInfo) => {
    try {
      setSelected({ info, project: await repo.previewCheckpoint(info.id) });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const makeCheckpoint = async () => {
    await repo.checkpoint(projectId, 'Saved by hand');
    setList(await repo.listCheckpoints(projectId));
  };

  return (
    <Modal title={`Checkpoints — ${projectName}`} onClose={onClose} wide>
      {error && <p className="error" role="alert">{error}</p>}
      {!selected ? (
        <>
          <p className="muted">Checkpoints are saved automatically every 10 minutes while you work and before a restore.</p>
          {list && list.length === 0 && <p>No checkpoints yet.</p>}
          <ul className="cp-list">
            {list?.map((c) => (
              <li key={c.id}>
                <button type="button" className="link" onClick={() => choose(c)}>
                  {formatDate(c.createdAt)}
                </button>
                <span className="muted"> · {c.reason}</span>
              </li>
            ))}
          </ul>
          <footer className="modal-actions">
            <button type="button" onClick={makeCheckpoint} disabled={!list}>Save checkpoint now</button>
            <button type="button" onClick={onClose}>Close</button>
          </footer>
        </>
      ) : (
        <>
          <p>
            Preview of <strong>{formatDate(selected.info.createdAt)}</strong> ({selected.info.reason}). Restoring replaces the current version;
            the current version is kept as a checkpoint first.
          </p>
          <OverheadPreview project={selected.project} className="preview-large" />
          <p className="muted">{summary(projectStats(selected.project))}</p>
          <footer className="modal-actions">
            <button type="button" onClick={() => setSelected(null)}>Back</button>
            <button
              type="button"
              className="primary"
              onClick={async () => {
                await repo.restoreCheckpoint(selected.info.id);
                onRestored();
              }}
            >
              Restore this version
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}
