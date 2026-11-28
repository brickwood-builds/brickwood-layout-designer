// The app (the new interface). It works on the same layouts as the classic interface
// (classic.html): same browser storage, OneDrive sync, files, print and report pages.
import { useEffect, useState } from 'react';
import { openDb } from '../storage/db';
import { ProjectRepository } from '../storage/repository';
import { FileLinks, dbLinkStore } from '../storage/fileLink';
import { LEGACY_STARTER_IDS, starterProjects } from '../starters';
import { initCloud } from '../cloud/service';
import { initPartLookup } from '../editor/partLookup';
import { PrintView } from '../ui/PrintView';
import { ReportView } from '../ui/ReportView';
import { NextHome } from './NextHome';
import { NextEditor } from './NextEditor';

const db = openDb();
const repo = new ProjectRepository(db);
const links = new FileLinks(dbLinkStore(db));

/** Where the trial (next.html, Nov 2026) kept its own copies of layouts. */
export const TRIAL_DB_NAME = 'brickwood-next-trial';

/** Layouts changed in the trial that are newer than (or missing from) the real ones. */
export async function trialLayouts(): Promise<{ id: string; name: string; updatedAt: string; isNew: boolean }[]> {
  if (!('indexedDB' in window) || !(await indexedDB.databases?.())?.some((d) => d.name === TRIAL_DB_NAME)) return [];
  const tdb = openDb(TRIAL_DB_NAME);
  try {
    const { projects } = await new ProjectRepository(tdb).listProjects();
    const out = [];
    for (const p of projects) {
      const real = await repo.getProject(p.id).catch(() => null);
      if (!real || p.updatedAt > real.updatedAt) out.push({ id: p.id, name: p.name, updatedAt: p.updatedAt, isNew: !real });
    }
    return out;
  } finally {
    tdb.close();
  }
}

/** Bring those layouts in from the trial. A real layout replaced this way is kept as a checkpoint. */
export async function bringInFromTrial(ids: string[]): Promise<number> {
  const tdb = openDb(TRIAL_DB_NAME);
  try {
    const trial = new ProjectRepository(tdb);
    for (const id of ids) {
      const p = await trial.getProject(id);
      const real = await repo.getProject(id).catch(() => null);
      if (real) await repo.replaceWithVersion(p, 'Before bringing in the version from the trial page');
      else await repo.createProject(p);
    }
    return ids.length;
  } finally {
    tdb.close();
  }
}

/** #/project/<id>[/print|/report|/box/<code>] — the same links as the classic interface. */
function readRoute(): { id: string; print: boolean; report: boolean; box?: string } | null {
  const m = /^#\/project\/([0-9a-f-]{36})(\/print|\/report|\/box\/([\w-]+))?$/i.exec(window.location.hash);
  return m ? { id: m[1]!, print: m[2] === '/print', report: m[2] === '/report', ...(m[3] ? { box: decodeURIComponent(m[3]) } : {}) } : null;
}

export function NextApp() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined);
    repo
      .seedStarters(starterProjects().map((s) => s.project), LEGACY_STARTER_IDS)
      // OneDrive: finish a sign-in if Microsoft just sent the user back, and start syncing.
      .then(() => initCloud(repo).init().catch(() => undefined))
      .then(() => initPartLookup(repo).init().catch(() => undefined))
      .then(() => {
        setRoute(readRoute());
        setReady(true);
      })
      .catch((e: Error) => setError(`Browser storage is not available: ${e.message}`));
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (error) return <p className="banner error" role="alert">{error}</p>;
  if (!ready) return null;
  if (route?.report) return <ReportView key={route.id} repo={repo} id={route.id} onBack={() => (window.location.hash = `#/project/${route.id}`)} />;
  if (route?.print) return <PrintView key={route.id} repo={repo} id={route.id} onBack={() => (window.location.hash = `#/project/${route.id}`)} />;
  return route ? (
    <NextEditor key={route.id} repo={repo} links={links} id={route.id} box={route.box} onBack={() => (window.location.hash = '')} />
  ) : (
    <NextHome repo={repo} links={links} onOpen={(pid) => (window.location.hash = `#/project/${pid}`)} />
  );
}
