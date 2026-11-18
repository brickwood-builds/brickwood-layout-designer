// "Look it up on Rebrickable" in the Single pieces search, and the dialog for the user's key.
import { useState, type ReactNode } from 'react';
import { useCloud } from '../cloud/service';
import type { LibraryPart } from '../domain/partsLibrary';
import { Modal } from '../ui/Modal';
import { partLookup, usePartLookup } from './partLookup';

/**
 * Below the offline results: parts looked up before that match (works offline), and a
 * button to look the search up live. `skip`: part numbers already shown above.
 */
export function OnlineLookup({ query, skip, render }: { query: string; skip: string[]; render: (p: LibraryPart) => ReactNode }) {
  const s = usePartLookup();
  const [busy, setBusy] = useState(false);
  // Kept with the search it was for, so it goes away when the search changes.
  const [failure, setFailure] = useState<{ query: string; message: string } | null>(null);
  const [done, setDone] = useState<{ query: string; count: number } | null>(null);
  const [keyDialog, setKeyDialog] = useState(false);
  const error = failure?.query === query ? failure.message : '';
  const lookup = partLookup();
  if (!lookup) return null;
  const cached = s.ready ? lookup.searchCached(query).parts.filter((p) => !skip.includes(p.partNo)) : [];
  const run = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const found = await lookup.lookup(query);
      setDone({ query, count: found.length });
    } catch (e) {
      setFailure({ query, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {cached.length > 0 && <span className="palette-sub">Looked up on Rebrickable</span>}
      {cached.map(render)}
      {s.hasKey ? (
        <button type="button" className="link small" disabled={busy || !query.trim()} onClick={() => void run()} title="Search Rebrickable’s full parts list (needs internet). Parts found are kept on this device for offline use.">
          {busy ? 'Looking up…' : `Look up “${query.trim()}” on Rebrickable`}
        </button>
      ) : (
        <button type="button" className="link small" onClick={() => setKeyDialog(true)} title="Look up any LEGO part online with your free Rebrickable key">
          Not here? Look it up online…
        </button>
      )}
      {done?.query === query && !busy && !error && <span className="muted small">{done.count ? `Found ${done.count} on Rebrickable — kept for offline use.` : 'Rebrickable found nothing for that.'}</span>}
      {error && (
        <span className="muted small" role="alert">
          {error}
        </span>
      )}
      {s.hasKey && (
        <button type="button" className="link small" onClick={() => setKeyDialog(true)}>
          Rebrickable key…
        </button>
      )}
      {keyDialog && <RebrickableKeyDialog onClose={() => setKeyDialog(false)} />}
    </>
  );
}

/** Enter, change or remove the Rebrickable key. */
export function RebrickableKeyDialog({ onClose }: { onClose: () => void }) {
  const s = usePartLookup();
  const c = useCloud();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lookup = partLookup();
  const valid = /^[A-Za-z0-9]{20,64}$/.test(key.trim());
  const save = async () => {
    if (!lookup) return;
    setBusy(true);
    setError('');
    try {
      if (navigator.onLine !== false) await lookup.checkKey(key);
      await lookup.saveKey(key);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Rebrickable key" onClose={onClose}>
      <div className="packing">
        <p className="small">
          With your own free Rebrickable key, the parts search can look up any LEGO part online. Parts you look up are kept on this device, so they work offline afterwards.
        </p>
        <ol className="small">
          <li>
            Sign in (or make a free account) at <strong>rebrickable.com</strong>.
          </li>
          <li>
            Open your <strong>Profile → Settings → API</strong> and choose <strong>Generate new API key</strong>.
          </li>
          <li>Copy the key and paste it here.</li>
        </ol>
        {s.hasKey && <p className="small">A key is saved. Paste a new one to replace it, or remove it.</p>}
        <label className="field">
          <span>API key</span>
          <input aria-label="Rebrickable API key" autoComplete="off" spellCheck={false} placeholder="Paste your key" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        {error && (
          <p className="small" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="primary" disabled={!valid || busy} onClick={() => void save()}>
            {busy ? 'Checking…' : 'Save'}
          </button>
          {s.hasKey && (
            <button
              type="button"
              onClick={async () => {
                await lookup?.saveKey('');
                onClose();
              }}
            >
              Remove key
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="muted small">
          {c.signedIn
            ? 'You’re signed in to OneDrive, so the key is also saved in a small settings file there and your other devices get it at their next sync.'
            : 'The key is kept on this device only. Sign in to OneDrive (on the Projects page) and it follows you to your other devices; otherwise enter it on each device.'}{' '}
          It is never put in project files, exports or backups.
        </p>
      </div>
    </Modal>
  );
}
