// Trial interface: the projects screen. Big cards with a picture of each layout; one button
// to start a new one; one to bring in copies of the projects from the app.
import { useEffect, useState, type FormEvent } from 'react';
import type { Project } from '../domain/schema';
import { createProject } from '../domain/project';
import type { ProjectRepository } from '../storage/repository';
import { OverheadPreview } from '../ui/OverheadPreview';
import { formatDate, tableSize } from '../ui/format';
import { copyFromApp } from './NextApp';
import { Icon } from './icons';

export function NextHome({ repo, onOpen }: { repo: ProjectRepository; onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const load = () => repo.listProjects().then((r) => setProjects(r.projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="nx nx-home">
      <header className="nx-home-head">
        <div>
          <h1>Your layouts</h1>
          <p className="nx-muted">
            A trial of a new look. It keeps its own copies, so nothing here changes your layouts in the{' '}
            <a href="./">main app</a>.
          </p>
        </div>
        <div className="nx-row">
          <button
            type="button"
            className="nx-btn"
            onClick={async () => {
              const n = await copyFromApp();
              setMessage(n ? `Copied ${n} layout${n === 1 ? '' : 's'} from the app.` : 'There were no layouts in the app on this device to copy.');
              await load();
            }}
            title="Bring in copies of the layouts you have in the main app (on this device). The app's own aren't changed."
          >
            <Icon name="download" /> Copy my layouts in
          </button>
          <button type="button" className="nx-btn nx-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New layout
          </button>
        </div>
      </header>
      {message && <p className="nx-note">{message}</p>}
      <div className="nx-cards">
        {projects?.map((p) => (
          <button key={p.id} type="button" className="nx-card" onClick={() => onOpen(p.id)} aria-label={`Open ${p.name}`}>
            <div className="nx-card-pic">
              <OverheadPreview project={p} />
            </div>
            <div className="nx-card-text">
              <strong>{p.name}</strong>
              <span className="nx-muted">
                {tableSize(p)} · {formatDate(p.updatedAt)}
              </span>
            </div>
          </button>
        ))}
      </div>
      {creating && (
        <NewLayout
          onClose={() => setCreating(false)}
          onCreate={async (name, w, d) => {
            const p = createProject({ name, table: { widthIn: w, depthIn: d } });
            await repo.createProject(p);
            onOpen(p.id);
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
