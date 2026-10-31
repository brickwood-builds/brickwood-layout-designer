import { useEffect, useState } from 'react';
import { Dashboard } from './ui/Dashboard';
import { Editor } from './editor/Editor';
import { PrintView } from './ui/PrintView';
import { openDb } from './storage/db';
import { ProjectRepository } from './storage/repository';
import { FileLinks, dbLinkStore } from './storage/fileLink';
import { LEGACY_STARTER_IDS, starterProjects } from './starters';

const db = openDb();
const repo = new ProjectRepository(db);
const links = new FileLinks(dbLinkStore(db));

/** Hash routing keeps the open project across a browser reload: #/project/<id>[/print]. */
function readRoute(): { id: string; print: boolean } | null {
  const m = /^#\/project\/([0-9a-f-]{36})(\/print)?$/i.exec(window.location.hash);
  return m ? { id: m[1]!, print: !!m[2] } : null;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    // Ask the browser not to evict our data under storage pressure (best effort).
    navigator.storage?.persist?.().catch(() => undefined);
    repo
      .seedStarters(starterProjects().map((s) => s.project), LEGACY_STARTER_IDS)
      .then(() => setReady(true))
      .catch((e: Error) => setError(`Browser storage is not available: ${e.message}`));
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (error) return <p className="banner error" role="alert">{error}</p>;
  if (!ready) return null;
  if (route?.print) return <PrintView key={route.id} repo={repo} id={route.id} onBack={() => (window.location.hash = `#/project/${route.id}`)} />;
  return route ? (
    <Editor key={route.id} repo={repo} links={links} id={route.id} onBack={() => (window.location.hash = '')} />
  ) : (
    <Dashboard repo={repo} links={links} onOpen={(id) => (window.location.hash = `#/project/${id}`)} />
  );
}
