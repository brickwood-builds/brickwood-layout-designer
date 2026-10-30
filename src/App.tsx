import { useEffect, useState } from 'react';
import { Dashboard } from './ui/Dashboard';
import { Editor } from './editor/Editor';
import { openDb } from './storage/db';
import { ProjectRepository } from './storage/repository';
import { starterProjects } from './starters';

const repo = new ProjectRepository(openDb());

/** Hash routing keeps the open project across a browser reload: #/project/<id>. */
function readRoute(): string | null {
  const m = /^#\/project\/([0-9a-f-]{36})$/i.exec(window.location.hash);
  return m ? m[1]! : null;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(readRoute);

  useEffect(() => {
    // Ask the browser not to evict our data under storage pressure (best effort).
    navigator.storage?.persist?.().catch(() => undefined);
    repo
      .seedStarters(starterProjects().map((s) => s.project))
      .then(() => setReady(true))
      .catch((e: Error) => setError(`Browser storage is not available: ${e.message}`));
    const onHash = () => setOpenId(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (error) return <p className="banner error" role="alert">{error}</p>;
  if (!ready) return null;
  return openId ? (
    <Editor key={openId} repo={repo} id={openId} onBack={() => (window.location.hash = '')} />
  ) : (
    <Dashboard repo={repo} onOpen={(id) => (window.location.hash = `#/project/${id}`)} />
  );
}
