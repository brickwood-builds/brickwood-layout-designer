// Back up everything / restore from a backup, on the Projects page (Phase 7A).
import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { RESTORE_LABEL, backupFileName, parseBackup, restoreByDefault, restorePlan, type Backup, type RestoreItem } from '../domain/backup';
import type { Project } from '../domain/schema';
import type { ProjectRepository } from '../storage/repository';

const REMIND_DAYS = 14;
const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);

/** Buttons and the "last backup" line for the Projects page. */
export function BackupControls({ repo, projects, onDone }: { repo: ProjectRepository; projects: Project[]; onDone: (message: string, error?: boolean) => void }) {
  const [last, setLast] = useState<string | null | undefined>(undefined);
  const [restore, setRestore] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    repo.lastBackupAt().then((v) => live && setLast(v), () => live && setLast(null));
    return () => {
      live = false;
    };
  }, [repo]);

  const backUp = async () => {
    setBusy(true);
    try {
      const backup = await repo.exportAll();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setLast(backup.createdAt);
      onDone(`Backed up ${backup.projects.length} project(s), ${backup.versions.length} version(s) and ${backup.photos.length} photo(s). Keep the file somewhere safe, e.g. your OneDrive folder.`);
    } catch (e) {
      onDone(`Backup failed: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      setBusy(false);
    }
  };

  const edited = last ? projects.some((p) => p.updatedAt > last) : projects.length > 0;
  const remind = edited && (!last || daysSince(last) >= REMIND_DAYS);

  return (
    <>
      <div className={remind ? 'backup-bar remind' : 'backup-bar'}>
        <span className="small">
          {last === undefined ? '' : last ? `Last backup: ${new Date(last).toLocaleDateString()}${daysSince(last) > 0 ? ` (${daysSince(last)} day${daysSince(last) === 1 ? '' : 's'} ago)` : ' (today)'}.` : 'No backup yet.'}
          {remind && ' Time for a backup — it keeps every project, version, photo and your parts list safe in one file.'}
        </span>
        <button type="button" className={remind ? 'primary' : undefined} disabled={busy} onClick={() => void backUp()}>
          Back up everything
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Restore from backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Backup file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setRestore(parseBackup(await f.text()));
            } catch (err) {
              onDone(err instanceof Error ? err.message : String(err), true);
            }
          }}
        />
      </div>
      {restore && (
        <RestoreDialog
          repo={repo}
          backup={restore}
          projects={projects}
          onClose={() => setRestore(null)}
          onRestored={(n) => {
            setRestore(null);
            onDone(`Restored ${n} project(s). Anything replaced was kept as a checkpoint.`);
          }}
        />
      )}
    </>
  );
}

function RestoreDialog({ repo, backup, projects, onClose, onRestored }: { repo: ProjectRepository; backup: Backup; projects: Project[]; onClose: () => void; onRestored: (n: number) => void }) {
  const [here, setHere] = useState<Project[]>(projects);
  useEffect(() => {
    // Include archived projects in the comparison.
    repo.listProjects({ includeArchived: true }).then((r) => setHere(r.projects), () => undefined);
  }, [repo]);
  const plan: RestoreItem[] = restorePlan(backup, here);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const chosen = picked ?? new Set(plan.filter(restoreByDefault).map((i) => i.id));
  const [inventory, setInventory] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };
  return (
    <Modal title="Restore from backup" onClose={onClose} wide>
      <div className="packing">
        <p className="small">
          Backup from <strong>{new Date(backup.createdAt).toLocaleString()}</strong>. Nothing changes until you choose Restore. A project that is already here is replaced, and what was here is kept as a checkpoint (Projects → More → Checkpoints…).
        </p>
        <table className="print-table">
          <thead>
            <tr>
              <th>Restore</th>
              <th>Project</th>
              <th>Compared with this device</th>
              <th>Saved in the backup</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((i) => (
              <tr key={i.id}>
                <td>
                  <input type="checkbox" aria-label={`Restore ${i.name}`} disabled={i.status === 'damaged'} checked={chosen.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
                </td>
                <td>{i.name}</td>
                <td className={i.status === 'older' ? 'warn-text' : undefined}>{RESTORE_LABEL[i.status]}</td>
                <td className="small">
                  {i.updatedAt ? new Date(i.updatedAt).toLocaleString() : ''}
                  {i.versions ? ` · ${i.versions} version(s)` : ''}
                  {i.photos ? ` · ${i.photos} photo(s)` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!!backup.inventory && (
          <label className="check">
            <input type="checkbox" checked={inventory} onChange={(e) => setInventory(e.target.checked)} />
            Also replace my parts list on this device (what I have, Brickwith parts, prices) with the one in the backup
          </label>
        )}
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={busy || (!chosen.size && !inventory)}
            onClick={async () => {
              setBusy(true);
              const r = await repo.restoreBackup(backup, [...chosen], { inventory });
              onRestored(r.restored);
            }}
          >
            Restore {chosen.size} project{chosen.size === 1 ? '' : 's'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
