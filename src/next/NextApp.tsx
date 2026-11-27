import { useEffect, useState } from 'react';
import { openDb, DEFAULT_DB_NAME } from '../storage/db';
import { ProjectRepository } from '../storage/repository';
import { starterProjects } from '../starters';
import { NextHome } from './NextHome';
import { NextEditor } from './NextEditor';

/** The trial's own projects (a separate browser database from the app's). */
export const NEXT_DB_NAME = 'brickwood-next-trial';
const repo = new ProjectRepository(openDb(NEXT_DB_NAME));

/** Copy every project from the app into the trial (replacing earlier copies). The app's own are only read. */
export async function copyFromApp(): Promise<number> {
  const db = openDb(DEFAULT_DB_NAME);
  try {
    const { projects } = await new ProjectRepository(db).listProjects();
    for (const p of projects) {
      const here = await repo.getProject(p.id).catch(() => null);
      if (here) await repo.replaceWithVersion(p, 'Copied again from the app');
      else await repo.createProject(p);
    }
    return projects.length;
  } finally {
    db.close();
  }
}

const readRoute = () => /^#\/project\/([0-9a-f-]{36})$/i.exec(window.location.hash)?.[1] ?? null;

export function NextApp() {
  const [ready, setReady] = useState(false);
  const [id, setId] = useState(readRoute);
  useEffect(() => {
    repo
      .seedStarters(starterProjects().map((s) => s.project))
      .catch(() => undefined)
      .finally(() => setReady(true));
    const onHash = () => setId(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (!ready) return null;
  return id ? <NextEditor key={id} repo={repo} id={id} onBack={() => (window.location.hash = '')} /> : <NextHome repo={repo} onOpen={(pid) => (window.location.hash = `#/project/${pid}`)} />;
}
