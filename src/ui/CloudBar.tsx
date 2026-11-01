// OneDrive sync on screen: the Projects-page bar (set up, sign in, status, conflicts) and a
// small status chip in the editor.
import { useState } from 'react';
import { cloud, useCloud, type CloudState } from '../cloud/service';
import { Modal } from './Modal';

const ago = (iso: string | null) => {
  if (!iso) return 'not yet';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : new Date(iso).toLocaleString();
};

function statusText(s: CloudState): string {
  if (s.status === 'syncing') return 'Syncing…';
  if (s.status === 'offline') return 'Offline — will sync when back online';
  if (s.status === 'error') return `Not synced: ${s.error}`;
  return `Synced ${ago(s.lastSync)}`;
}

/** Editor status bar: one word on sync, click to sync now. */
export function CloudChip() {
  const s = useCloud();
  if (!s.signedIn) return null;
  return (
    <button type="button" className={`file-btn cloud-chip ${s.status}`} onClick={() => void cloud()?.syncNow()} title={`OneDrive: ${statusText(s)}. Click to sync now.`}>
      ☁ {s.status === 'syncing' ? 'Syncing…' : s.status === 'offline' ? 'Offline' : s.status === 'error' ? 'Not synced' : 'Synced'}
    </button>
  );
}

/** Projects page: OneDrive sync — set up, sign in, status, and changes made on two devices. */
export function CloudBar({ onChanged }: { onChanged: () => void }) {
  const s = useCloud();
  const [setup, setSetup] = useState(false);
  const c = cloud();
  if (!c) return null;
  return (
    <>
      <div className={`backup-bar cloud-bar${s.status === 'error' ? ' remind' : ''}`}>
        {!s.configured ? (
          <>
            <span className="small">OneDrive sync isn’t set up. With it, your layouts, parts list, versions and photos follow you between the computer and the iPad.</span>
            <button type="button" onClick={() => setSetup(true)}>
              Set up OneDrive sync…
            </button>
          </>
        ) : !s.signedIn ? (
          <>
            <span className="small">{s.error ? `${s.error}. ` : ''}OneDrive sync is set up — sign in with your Microsoft account on this device.</span>
            <button type="button" className="primary" onClick={() => void c.signIn()}>
              Sign in to OneDrive
            </button>
            <button type="button" className="link" onClick={() => setSetup(true)}>
              Settings
            </button>
          </>
        ) : (
          <>
            <span className="small" role="status">
              ☁ OneDrive{s.account ? ` (${s.account})` : ''}: {statusText(s)}
            </span>
            <button type="button" disabled={s.status === 'syncing'} onClick={() => void c.syncNow().then(onChanged)}>
              Sync now
            </button>
            <button type="button" className="link" onClick={() => void c.signOut()}>
              Sign out
            </button>
          </>
        )}
      </div>
      {s.conflicts.map((k) => (
        <div key={k.projectId} className="banner warn" role="alert">
          <span>
            <strong>{k.name}</strong> was changed on this device and on another one. Which do you want to keep? The other is kept as a checkpoint.
          </span>
          <span className="actions">
            <button type="button" onClick={() => void c.resolve(k.projectId, 'here').then(onChanged)}>
              Keep this device’s
            </button>
            <button type="button" onClick={() => void c.resolve(k.projectId, 'there').then(onChanged)}>
              Take the other device’s
            </button>
          </span>
        </div>
      ))}
      {setup && <SetupDialog onClose={() => setSetup(false)} />}
    </>
  );
}

function SetupDialog({ onClose }: { onClose: () => void }) {
  const [id, setId] = useState('');
  const here = `${window.location.origin}${window.location.pathname}`;
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
  return (
    <Modal title="Set up OneDrive sync" onClose={onClose} wide>
      <div className="packing cloud-setup">
        <p className="small">
          This is done once, on a computer. It tells Microsoft that this app may use its own folder in your OneDrive (OneDrive → Apps → Brickwood Layout Designer) — nothing else. It is free.
        </p>
        <ol className="small">
          <li>
            Open <strong>entra.microsoft.com</strong> (or portal.azure.com) and sign in with the Microsoft account you use for OneDrive. If it asks you to create a free Azure account first, do that — app registrations cost nothing.
          </li>
          <li>
            Go to <strong>App registrations → New registration</strong>.
            <ul>
              <li>Name: Brickwood Layout Designer</li>
              <li>
                Supported account types: <strong>Personal Microsoft accounts only</strong>
              </li>
              <li>
                Redirect URI: choose <strong>Single-page application (SPA)</strong> and enter <code>{here}</code>
              </li>
            </ul>
          </li>
          <li>
            Open <strong>API permissions → Add a permission → Microsoft Graph → Delegated</strong>, tick <strong>Files.ReadWrite.AppFolder</strong>, and add it.
          </li>
          <li>
            On the <strong>Overview</strong> page, copy the <strong>Application (client) ID</strong> and paste it here.
          </li>
        </ol>
        <label className="field">
          <span>Application (client) ID</span>
          <input aria-label="Application (client) ID" placeholder="00000000-0000-0000-0000-000000000000" value={id} onChange={(e) => setId(e.target.value)} />
        </label>
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!valid}
            onClick={async () => {
              await cloud()?.configure(id);
              onClose();
            }}
          >
            Save
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="muted small">Then choose Sign in to OneDrive on each device (computer and iPad). The ID is not a secret; you can also send it to be built into the app, so other devices don’t need this step.</p>
      </div>
    </Modal>
  );
}
