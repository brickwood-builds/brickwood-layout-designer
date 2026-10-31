// Phase 3B: the parts list — what this layout needs, what you have, what to buy.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Modal } from '../ui/Modal';
import { applyImport, emptyInventory, inventoryCsv, partsListCsv, partsNeeded, readInventoryCsv, rebrickableCsv, setHave, shoppingList, type Inventory } from '../domain/inventory';
import { loadLibrary, PARTS_SOURCE_URL, type PartsLibrary } from '../domain/partsLibrary';
import type { ProjectRepository } from '../storage/repository';
import type { EditorStore } from './store';

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileName = (project: string, what: string) => `${project.replace(/[^\w -]+/g, '').trim() || 'layout'} - ${what}.csv`;

/** Status-bar button (when Parts & inventory is on) that opens the parts list. */
export function PartsListButton({ store, repo }: { store: EditorStore; repo: ProjectRepository }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="file-btn" onClick={() => setOpen(true)} title="Parts this layout needs, what you have and what to buy">
        Parts list…
      </button>
      {open && <PartsListDialog store={store} repo={repo} onClose={() => setOpen(false)} />}
    </>
  );
}

function PartsListDialog({ store, repo, onClose }: { store: EditorStore; repo: ProjectRepository; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const [inv, setInv] = useState<Inventory | null>(null);
  const [lib, setLib] = useState<PartsLibrary | null>(null);
  const [message, setMessage] = useState('');
  const [onlyToBuy, setOnlyToBuy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    repo.getInventory().then((i) => live && setInv(i), () => live && setInv(emptyInventory()));
    loadLibrary().then((l) => live && setLib(l), () => undefined);
    return () => {
      live = false;
    };
  }, [repo]);

  const needed = useMemo(() => partsNeeded(project), [project]);
  const rows = useMemo(() => (inv ? shoppingList(needed.parts, inv) : []), [needed, inv]);
  const shown = onlyToBuy ? rows.filter((r) => r.toBuy > 0) : rows;
  const total = rows.reduce((n, r) => n + r.needed, 0);
  const toBuy = rows.reduce((n, r) => n + r.toBuy, 0);
  const kindsToBuy = rows.filter((r) => r.toBuy > 0).length;

  const save = (next: Inventory) => {
    setInv(next);
    repo.saveInventory(next).catch(() => setMessage('Couldn’t save what you have on this device.'));
  };

  const importFile = async (f: File) => {
    if (!inv) return;
    const l = lib ?? (await loadLibrary());
    const imp = readInventoryCsv(await f.text(), l.colorNames);
    if (!imp.rows.size) return setMessage(imp.problems[0] ?? 'Nothing to import in that file.');
    save(applyImport(inv, imp));
    setMessage(`Read ${imp.rows.size} part${imp.rows.size === 1 ? '' : 's'} from ${f.name}.${imp.problems.length ? ` ${imp.problems.length} line${imp.problems.length === 1 ? ' was' : 's were'} skipped: ${imp.problems.slice(0, 3).join(' ')}` : ''}`);
  };

  return (
    <Modal title="Parts list" onClose={onClose} wide>
      <div className="parts-list">
        <p className="small">
          <strong>{project.name}</strong> uses {total} real LEGO piece{total === 1 ? '' : 's'} ({rows.length} kind{rows.length === 1 ? '' : 's'}).{' '}
          {inv && (toBuy ? `To buy: ${toBuy} piece${toBuy === 1 ? '' : 's'} of ${kindsToBuy} kind${kindsToBuy === 1 ? '' : 's'}.` : 'You have everything it needs.')}
        </p>
        {(needed.unnumbered > 0 || needed.stairs > 0) && (
          <p className="muted small">
            Not counted:
            {needed.unnumbered > 0 && ` ${needed.unnumbered} piece${needed.unnumbered === 1 ? '' : 's'} you made yourself (no part number)`}
            {needed.unnumbered > 0 && needed.stairs > 0 && ' and'}
            {needed.stairs > 0 && ` ${needed.stairs} stair step${needed.stairs === 1 ? '' : 's'} (planning shapes)`}.
          </p>
        )}
        <p className="muted small">“Have” is your own parts — one list for all your projects, kept on this device. Type what you have, or import a CSV.</p>
        <label className="check">
          <input type="checkbox" checked={onlyToBuy} onChange={(e) => setOnlyToBuy(e.target.checked)} />
          Only show what to buy
        </label>
        {!inv ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No real LEGO parts in this layout yet. Pieces from Single pieces (and Draw) are listed here.</p>
        ) : (
          <div className="parts-table-wrap">
            <table className="print-table parts-table">
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Colour</th>
                  <th>Needed</th>
                  <th>Have</th>
                  <th>To buy</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.partNo}|${r.colorName}`} className={r.toBuy > 0 ? 'short' : undefined}>
                    <td>
                      {r.name} <span className="muted">{r.partNo}</span>
                    </td>
                    <td>
                      <i className="swatch" style={{ background: r.color }} /> {r.colorName}
                    </td>
                    <td>{r.needed}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="have"
                        aria-label={`Have: ${r.name} ${r.partNo}, ${r.colorName}`}
                        defaultValue={r.have}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v >= 0 && v !== r.have) save(setHave(inv, r.partNo, r.colorName, v));
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    </td>
                    <td>{r.toBuy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
        <div className="actions wrap">
          <button
            type="button"
            className="primary"
            disabled={!toBuy || !lib}
            onClick={() => {
              const r = rebrickableCsv(rows, lib!.colorIds);
              download(fileName(project.name, 'shopping list (Rebrickable)'), r.csv);
              setMessage(r.skipped.length ? `${r.skipped.length} part(s) with an unknown colour were left out.` : '');
            }}
            title="Part, Rebrickable colour id, quantity — import it on Rebrickable to price it or make a BrickLink wanted list"
          >
            Download shopping list
          </button>
          <button type="button" disabled={!rows.length} onClick={() => download(fileName(project.name, 'parts list'), partsListCsv(rows))} title="Every part with names, colours, needed, have and to buy — opens in Excel">
            Download parts list
          </button>
          <button type="button" disabled={!inv} onClick={() => fileRef.current?.click()} title="A CSV with Part, Colour and Quantity columns (Rebrickable or this app’s own)">
            Import what I have…
          </button>
          <button type="button" disabled={!inv || !Object.keys(inv.have).length} onClick={() => download('Brickwood - parts I have.csv', inventoryCsv(inv!))}>
            Export what I have
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            aria-label="Import what I have"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
        <p className="muted small">
          The shopping list is in{' '}
          <a href={PARTS_SOURCE_URL} target="_blank" rel="noreferrer">
            Rebrickable
          </a>
          ’s format: import it there (free account) to see prices and make a BrickLink wanted list.
        </p>
      </div>
    </Modal>
  );
}
