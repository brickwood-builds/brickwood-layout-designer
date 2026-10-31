// Phase 3: the parts list — what this layout needs, what you have, where to buy the rest
// (Brickwith first or BrickLink only), what it should cost, and what you've spent.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from 'zustand';
import { Modal } from '../ui/Modal';
import {
  SUPPLIER_NAME,
  applyImport,
  brickwithCsv,
  costSummary,
  emptyInventory,
  formatMoney,
  inventoryCsv,
  partsListCsv,
  partsNeeded,
  readBrickwithCsv,
  readInventoryCsv,
  rebrickableCsv,
  setBrickwith,
  setHave,
  setPrice,
  setUsualPrice,
  shoppingList,
  spentTotal,
  type Inventory,
  type ShoppingRow,
  type Supplier,
} from '../domain/inventory';
import { loadLibrary, PARTS_SOURCE_URL, type PartsLibrary } from '../domain/partsLibrary';
import { newId } from '../domain/ids';
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
const parseMoney = (text: string): number | null | undefined => {
  const t = text.replace(/[^\d.]/g, '');
  if (!text.trim()) return null;
  const n = Number(t);
  return t && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Status-bar button (when Parts & inventory is on) that opens the parts list. */
export function PartsListButton({ store, repo }: { store: EditorStore; repo: ProjectRepository }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="file-btn" onClick={() => setOpen(true)} title="Parts this layout needs, what you have, what to buy and what it costs">
        Parts list…
      </button>
      {open && <PartsListDialog store={store} repo={repo} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A number box that saves when you leave it (or press Enter). */
function MoneyInput({ value, placeholder, label, onSave }: { value: number | null; placeholder?: string; label: string; onSave: (v: number | null) => void }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      className="money"
      aria-label={label}
      placeholder={placeholder}
      defaultValue={value ?? ''}
      key={value ?? 'none'}
      onBlur={(e) => {
        const v = parseMoney(e.target.value);
        if (v !== undefined && v !== value) onSave(v);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function PartsListDialog({ store, repo, onClose }: { store: EditorStore; repo: ProjectRepository; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const [inv, setInv] = useState<Inventory | null>(null);
  const [lib, setLib] = useState<PartsLibrary | null>(null);
  const [message, setMessage] = useState('');
  const [onlyToBuy, setOnlyToBuy] = useState(false);
  const haveFile = useRef<HTMLInputElement>(null);
  const bwFile = useRef<HTMLInputElement>(null);
  const brickwithFirst = project.settings.brickwithFirst;

  useEffect(() => {
    let live = true;
    repo.getInventory().then((i) => live && setInv(i), () => live && setInv(emptyInventory()));
    loadLibrary().then((l) => live && setLib(l), () => undefined);
    return () => {
      live = false;
    };
  }, [repo]);

  const needed = useMemo(() => partsNeeded(project), [project]);
  const rows = useMemo(() => (inv ? shoppingList(needed.parts, inv, brickwithFirst) : []), [needed, inv, brickwithFirst]);
  const shown = onlyToBuy ? rows.filter((r) => r.toBuy > 0) : rows;
  const total = rows.reduce((n, r) => n + r.needed, 0);
  const toBuy = rows.reduce((n, r) => n + r.toBuy, 0);
  const kindsToBuy = rows.filter((r) => r.toBuy > 0).length;
  const cost = costSummary(rows);
  const spent = spentTotal(project);

  const save = (next: Inventory) => {
    setInv(next);
    repo.saveInventory(next).catch(() => setMessage('Couldn’t save your parts book on this device.'));
  };

  const importHave = async (f: File) => {
    if (!inv) return;
    const l = lib ?? (await loadLibrary());
    const imp = readInventoryCsv(await f.text(), l.colorNames);
    if (!imp.rows.size) return setMessage(imp.problems[0] ?? 'Nothing to import in that file.');
    save(applyImport(inv, imp));
    setMessage(`Read ${imp.rows.size} part${imp.rows.size === 1 ? '' : 's'} from ${f.name}.${imp.problems.length ? ` Skipped: ${imp.problems.slice(0, 3).join(' ')}` : ''}`);
  };
  const importBrickwith = async (f: File) => {
    if (!inv) return;
    const l = lib ?? (await loadLibrary());
    const r = readBrickwithCsv(await f.text(), l.colorNames);
    if (!r.count) return setMessage(r.problems[0] ?? 'Nothing to import in that file.');
    save(r.apply(inv));
    setMessage(`Marked ${r.count} part${r.count === 1 ? '' : 's'} as made by Brickwith (with prices where the file had them).${r.problems.length ? ` Skipped: ${r.problems.slice(0, 3).join(' ')}` : ''}`);
  };

  const priceLabel = (r: ShoppingRow) => `Price each from ${SUPPLIER_NAME[r.supplier]}: ${r.name} ${r.partNo}, ${r.colorName}`;

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

        <label className="check sourcing">
          <input
            type="checkbox"
            checked={brickwithFirst}
            onChange={(e) => store.getState().commit((p) => ({ ...p, settings: { ...p.settings, brickwithFirst: e.target.checked } }))}
          />
          <span>
            <strong>Use Brickwith first, BrickLink for the rest</strong>
            <br />
            <span className="muted small">
              {brickwithFirst
                ? 'Tick “Brickwith has it” for parts Brickwith makes (remembered for all projects); everything else stays on the BrickLink list.'
                : 'Off: genuine LEGO only — everything is bought on BrickLink (for official LEGO events).'}
            </span>
          </span>
        </label>

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
                  {brickwithFirst && <th>Brickwith has it</th>}
                  <th>Buy from</th>
                  <th>Each</th>
                  <th>Cost</th>
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
                    <td className="to-buy">{r.toBuy || '—'}</td>
                    {brickwithFirst && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Brickwith has it: ${r.name} ${r.partNo}, ${r.colorName}`}
                          checked={r.brickwithMakes}
                          onChange={(e) => save(setBrickwith(inv, r.partNo, r.colorName, e.target.checked))}
                        />
                      </td>
                    )}
                    <td>{SUPPLIER_NAME[r.supplier]}</td>
                    <td>
                      <MoneyInput
                        label={priceLabel(r)}
                        value={r.ownPrice ? r.each : null}
                        placeholder={r.each !== null && !r.ownPrice ? `~${r.each.toFixed(2)}` : ''}
                        onSave={(v) => save(setPrice(inv, r.supplier, r.partNo, r.colorName, v))}
                      />
                    </td>
                    <td>{r.toBuy ? (r.cost !== null ? `${r.ownPrice ? '' : '~'}${formatMoney(r.cost)}` : '?') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {inv && toBuy > 0 && (
          <div className="cost-box" role="status" aria-label="Estimated cost">
            <strong>
              Estimated cost to buy: {formatMoney(cost.total)}
              {cost.unpriced > 0 && ` + ${cost.unpriced} piece${cost.unpriced === 1 ? '' : 's'} without a price`}
            </strong>
            <span className="small">
              BrickLink {formatMoney(cost.bySupplier.bricklink.cost)} ({cost.bySupplier.bricklink.pieces} pieces)
              {brickwithFirst && ` · Brickwith ${formatMoney(cost.bySupplier.brickwith.cost)} (${cost.bySupplier.brickwith.pieces} pieces)`}
            </span>
            {cost.estimated && <span className="muted small">“~” prices are your usual price per piece, not the part’s own price.</span>}
          </div>
        )}

        {inv && (
          <details className="parts-more">
            <summary>Usual prices (for an estimate before every part is priced)</summary>
            <div className="row">
              {(['bricklink', 'brickwith'] as Supplier[])
                .filter((s) => s === 'bricklink' || brickwithFirst)
                .map((s) => (
                  <label key={s} className="field">
                    <span>{SUPPLIER_NAME[s]}: usual price per piece</span>
                    <MoneyInput label={`${SUPPLIER_NAME[s]} usual price per piece`} value={inv.usualPrice[s] ?? null} onSave={(v) => save(setUsualPrice(inv, s, v))} />
                  </label>
                ))}
            </div>
          </details>
        )}

        <Spending store={store} estimate={cost.total} spent={spent} />

        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
        <div className="actions wrap">
          <button
            type="button"
            className="primary"
            disabled={!lib || !rows.some((r) => r.toBuy > 0 && r.supplier === 'bricklink')}
            onClick={() => {
              const r = rebrickableCsv(
                rows.filter((x) => x.supplier === 'bricklink'),
                lib!.colorIds,
              );
              download(fileName(project.name, 'BrickLink shopping list (Rebrickable format)'), r.csv);
              setMessage(r.skipped.length ? `${r.skipped.length} part(s) with an unknown colour were left out.` : '');
            }}
            title="Part, Rebrickable colour id, quantity — import it on Rebrickable to price it or make a BrickLink wanted list"
          >
            BrickLink shopping list
          </button>
          {brickwithFirst && (
            <button type="button" className="primary" disabled={!inv || !rows.some((r) => r.toBuy > 0 && r.supplier === 'brickwith')} onClick={() => download(fileName(project.name, 'Brickwith shopping list'), brickwithCsv(rows, inv!))}>
              Brickwith shopping list
            </button>
          )}
          <button type="button" disabled={!rows.length} onClick={() => download(fileName(project.name, 'parts list'), partsListCsv(rows))} title="Every part with colour, needed, have, to buy, where from and cost — opens in Excel">
            Download parts list
          </button>
          <button type="button" disabled={!inv} onClick={() => haveFile.current?.click()} title="A CSV with Part, Colour and Quantity columns (Rebrickable or this app’s own)">
            Import what I have…
          </button>
          <button type="button" disabled={!inv || !Object.keys(inv.have).length} onClick={() => download('Brickwood - parts I have.csv', inventoryCsv(inv!))}>
            Export what I have
          </button>
          {brickwithFirst && (
            <button type="button" disabled={!inv} onClick={() => bwFile.current?.click()} title="A CSV with Part and Colour columns (and Price, Brickwith part if you have them): marks those parts as made by Brickwith">
              Import Brickwith parts…
            </button>
          )}
          <input
            ref={haveFile}
            type="file"
            accept=".csv,text/csv"
            hidden
            aria-label="Import what I have"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importHave(f);
            }}
          />
          <input
            ref={bwFile}
            type="file"
            accept=".csv,text/csv"
            hidden
            aria-label="Import Brickwith parts"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importBrickwith(f);
            }}
          />
        </div>
        <p className="muted small">
          The BrickLink list is in{' '}
          <a href={PARTS_SOURCE_URL} target="_blank" rel="noreferrer">
            Rebrickable
          </a>
          ’s format: import it there (free account) to see prices and make a BrickLink wanted list. Your parts, prices and what Brickwith makes are kept on this device for all projects.
        </p>
      </div>
    </Modal>
  );
}

/** Money spent on this layout, against the estimate. Saved with the project (undoable). */
function Spending({ store, estimate, spent }: { store: EditorStore; estimate: number; spent: number }) {
  const spending = useStore(store, (s) => s.project.spending);
  const [draft, setDraft] = useState({ date: today(), supplier: 'BrickLink', note: '', amount: '' });
  const add = (e: FormEvent) => {
    e.preventDefault();
    const amount = parseMoney(draft.amount);
    if (amount === null || amount === undefined) return;
    const entry = { id: newId(), date: draft.date || today(), supplier: draft.supplier.trim() || 'Other', note: draft.note.trim(), amount };
    store.getState().commit((p) => ({ ...p, spending: [...p.spending, entry] }));
    setDraft({ ...draft, note: '', amount: '' });
  };
  return (
    <details className="parts-more" open={spending.length > 0}>
      <summary>
        Money spent on this layout: {formatMoney(spent)}
        {estimate > 0 && ` (still to buy: about ${formatMoney(estimate)})`}
      </summary>
      {spending.length > 0 && (
        <table className="print-table spending">
          <thead>
            <tr>
              <th>Date</th>
              <th>Where</th>
              <th>What</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...spending]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((s) => (
                <tr key={s.id}>
                  <td>{s.date}</td>
                  <td>{s.supplier}</td>
                  <td>{s.note}</td>
                  <td>{formatMoney(s.amount)}</td>
                  <td>
                    <button type="button" className="link" aria-label={`Remove ${s.supplier} ${s.date}`} onClick={() => store.getState().commit((p) => ({ ...p, spending: p.spending.filter((x) => x.id !== s.id) }))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      <form className="spend-form" onSubmit={add}>
        <input type="date" aria-label="Date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <input list="suppliers" aria-label="Where" placeholder="Where" value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} />
        <datalist id="suppliers">
          <option value="BrickLink" />
          <option value="Brickwith" />
          <option value="LEGO Pick a Brick" />
          <option value="LEGO store" />
        </datalist>
        <input aria-label="What" placeholder="What (e.g. order #123, castle walls)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <input inputMode="decimal" aria-label="Amount" placeholder="Amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
        <button type="submit" disabled={parseMoney(draft.amount) == null}>
          Add
        </button>
      </form>
    </details>
  );
}
