import { useEffect, useState } from 'react';
import { OverheadPreview } from './OverheadPreview';
import { summary, tableSize } from './format';
import { checkLayout } from '../domain/geometry';
import { projectStats } from '../domain/project';
import { MILS_COLORS, type Project } from '../domain/schema';
import type { ProjectRepository } from '../storage/repository';

/** Overhead view of one project. Editing tools arrive with the MILS editor (Milestone 1B). */
export function ProjectView({ repo, id, onBack }: { repo: ProjectRepository; id: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    repo.getProject(id).then(setProject, (e: Error) => setError(e.message));
  }, [repo, id]);

  const warnings = project ? checkLayout(project) : [];

  return (
    <div className="page">
      <header className="topbar">
        <button type="button" onClick={onBack}>
          ← Projects
        </button>
        <h1>{project?.name ?? 'Loading…'}</h1>
      </header>
      {error && <p className="banner error" role="alert">{error}</p>}
      {project && (
        <>
          <main className="viewer">
            <OverheadPreview project={project} labels className="preview-large" />
          </main>
          <footer className="statusbar">
            <span>{summary(projectStats(project))} · {tableSize(project)}</span>
            <span className="legend">
              <i style={{ background: MILS_COLORS['32x32'] }} /> 32×32
              <i style={{ background: MILS_COLORS['16x16'] }} /> 16×16
              <i style={{ background: MILS_COLORS['16x8'] }} /> 16×8
              <i style={{ background: MILS_COLORS.custom }} /> custom
              <i style={{ background: '#c05046' }} /> ride
            </span>
            <span className={warnings.length ? 'warn' : 'muted'}>
              {warnings.length ? `${warnings.length} layout warning${warnings.length > 1 ? 's' : ''}` : 'No layout warnings'}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
