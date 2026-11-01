// Phase 6: setup and teardown at a show — tasks from the layout, helpers, dependencies with
// overrides, timing, issues, a printed guide with module maps, and helper progress files.
import { useRef, useState, type FormEvent } from 'react';
import { useStore } from 'zustand';
import { Modal } from '../ui/Modal';
import { overheadSvg } from '../ui/overheadSvg';
import { printPage } from '../ui/labels';
import { footprint } from '../domain/geometry';
import { findItem } from '../domain/edits';
import {
  addCustomTask,
  addHelper,
  applyMerge,
  assignTask,
  completeTask,
  duration,
  logIssue,
  looseOn,
  markTime,
  phaseProgress,
  planMerge,
  progressFile,
  removeCustomTask,
  removeHelper,
  reopenTask,
  taskViews,
  type MergePlan,
  type Phase,
  type TaskView,
} from '../domain/setup';
import type { Project, Show } from '../domain/schema';
import { setMyName, useMyName } from './me';
import type { EditorState, EditorStore } from './store';

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Status-bar button: the setup plan of the next show. */
export function SetupButton({ store }: { store: EditorStore }) {
  const next = useStore(store, (s) => {
    const today = new Date().toISOString().slice(0, 10);
    const open = s.project.shows.filter((x) => !x.done).sort((a, b) => a.start.localeCompare(b.start));
    return open.find((x) => x.end >= today) ?? open[open.length - 1];
  });
  return (
    <button
      type="button"
      className="file-btn"
      onClick={() => store.getState().set(next ? { setupDialog: next.id } : { showsDialog: 'list' })}
      title={next ? `Setup and teardown at ${next.name}` : 'Add a show first, then its setup plan'}
    >
      Setup…
    </button>
  );
}

export function SetupDialog({ store }: { store: EditorStore }) {
  const show = useStore(store, (s) => (s.setupDialog ? s.project.shows.find((x) => x.id === s.setupDialog) : undefined));
  if (!show) return null;
  return <SetupWindow key={show.id} store={store} show={show} onClose={() => store.getState().set({ setupDialog: null })} />;
}

function SetupWindow({ store, show, onClose }: { store: EditorStore; show: Show; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const me = useMyName();
  const [tab, setTab] = useState<Phase | 'helpers'>('setup');
  const [filter, setFilter] = useState<'all' | 'mine' | 'todo'>('all');
  const views = taskViews(project, show);
  const commit = store.getState().commit;

  return (
    <Modal title={`Setup — ${show.name}`} onClose={onClose} wide>
      <div className="setup">
        <div className="inline-form">
          <label className="field me">
            <span>I am</span>
            <input list="helper-names" aria-label="I am" placeholder="Your name" defaultValue={me} key={me} onBlur={(e) => e.target.value.trim() !== me && setMyName(e.target.value)} />
            <datalist id="helper-names">
              {show.setup.helpers.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </label>
          <div className="seg" role="tablist" aria-label="Part">
            {(['setup', 'teardown', 'helpers'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === 'setup' ? `Setup ${count(views, 'setup')}` : t === 'teardown' ? `Teardown ${count(views, 'teardown')}` : 'Helpers & log'}
              </button>
            ))}
          </div>
        </div>
        {!me && <p className="banner warn small">Type your name above, so the log shows who did what.</p>}
        {tab === 'helpers' ? (
          <HelpersTab store={store} show={show} project={project} me={me} />
        ) : (
          <PhaseTab store={store} show={show} project={project} views={views.filter((t) => t.phase === tab)} all={views} phase={tab} me={me} filter={filter} setFilter={setFilter} commit={commit} />
        )}
      </div>
    </Modal>
  );
}

const count = (views: TaskView[], phase: Phase) => {
  const p = phaseProgress(views, phase);
  return `${p.done}/${p.total}`;
};

function PhaseTab({
  store,
  show,
  project,
  views,
  all,
  phase,
  me,
  filter,
  setFilter,
  commit,
}: {
  store: EditorStore;
  show: Show;
  project: Project;
  views: TaskView[];
  all: TaskView[];
  phase: Phase;
  me: string;
  filter: 'all' | 'mine' | 'todo';
  setFilter: (f: 'all' | 'mine' | 'todo') => void;
  commit: EditorState['commit'];
}) {
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [own, setOwn] = useState({ title: '', after: '', required: false });
  const start = phase === 'setup' ? 'setupStart' : 'teardownStart';
  const end = phase === 'setup' ? 'setupEnd' : 'teardownEnd';
  const times = show.setup.times;
  const pr = phaseProgress(all, phase);
  const levels = new Map(project.levels.map((l) => [l.id, l.name]));
  const shown = views.filter((t) => (filter === 'mine' ? t.helper === me && t.status !== 'done' : filter === 'todo' ? t.status !== 'done' : true));

  const done = (t: TaskView) => {
    if (t.blockedBy.length) {
      setReasonFor(t.key);
      return;
    }
    commit((p) => completeTask(p, show.id, t, me) ?? p);
  };

  const printGuide = () => printPage(guideHtml(project, show, all, phase));

  return (
    <>
      <div className="inline-form timing">
        {!times[start] ? (
          <button type="button" className="primary" onClick={() => commit((p) => markTime(p, show.id, start, me))}>
            Start {phase}
          </button>
        ) : (
          <span className="small">
            Started {time(times[start])}
            {times[end] ? ` · finished ${time(times[end])} · took ${duration(times[start], times[end])}` : ''}
          </span>
        )}
        {times[start] && !times[end] && (
          <button type="button" onClick={() => commit((p) => markTime(p, show.id, end, me))}>
            {phase === 'setup' ? 'Setup' : 'Teardown'} finished
          </button>
        )}
        <progress max={pr.total || 1} value={pr.done} aria-label={`${phase} progress`} />
        <span className="small">
          {pr.done} of {pr.total} done
        </span>
      </div>
      <div className="inline-form">
        <div className="seg" role="group" aria-label="Show">
          {(
            [
              ['all', 'All'],
              ['todo', 'Still to do'],
              ['mine', 'Mine'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        <button type="button" onClick={printGuide}>
          Print {phase} guide
        </button>
      </div>
      <ol className="tasks">
        {shown.map((t) => (
          <li key={t.key} className={`task ${t.status}`}>
            <label className="check">
              <input type="checkbox" aria-label={`Done: ${t.title}`} checked={t.status === 'done'} onChange={(e) => (e.target.checked ? done(t) : commit((p) => reopenTask(p, show.id, t, me)))} />
              <span>
                <strong>{t.title}</strong>
                {t.levelId && project.levels.length > 1 && <span className="muted small"> · {levels.get(t.levelId)}</span>}
                {t.details.length > 0 && <span className="small"> — {t.details.join(', ')}</span>}
                <br />
                <span className="muted small">
                  {t.status === 'done' && `Done by ${t.by ?? '?'} at ${time(t.at)}${t.overridden ? ' (out of order)' : ''}`}
                  {t.status === 'claimed' && `${t.helper} is on it`}
                  {t.status === 'assigned' && `Assigned to ${t.helper}`}
                  {t.status !== 'done' && t.blockedBy.length > 0 && ` · first: ${t.blockedBy.join(', ')}`}
                  {t.status !== 'done' && t.waitingFor.length > 0 && ` · usually after ${t.waitingFor.join(', ')}`}
                </span>
              </span>
            </label>
            {t.status !== 'done' && (
              <span className="task-actions">
                {t.helper !== me && (
                  <button type="button" disabled={!me} onClick={() => commit((p) => assignTask(p, show.id, t, me, me))}>
                    I’ll do it
                  </button>
                )}
                {show.setup.helpers.length > 0 && (
                  <select aria-label={`Assign: ${t.title}`} value="" onChange={(e) => e.target.value && commit((p) => assignTask(p, show.id, t, e.target.value, me))}>
                    <option value="">Assign…</option>
                    {show.setup.helpers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                )}
                {t.kind === 'custom' && (
                  <button type="button" className="link" aria-label={`Remove task ${t.title}`} onClick={() => commit((p) => removeCustomTask(p, show.id, t.key.split(':')[2]!))}>
                    remove
                  </button>
                )}
              </span>
            )}
            {reasonFor === t.key && (
              <form
                className="inline-form override"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  commit((p) => completeTask(p, show.id, t, me, reason) ?? p);
                  setReasonFor(null);
                  setReason('');
                }}
              >
                <span className="small">Not done yet: {t.blockedBy.join(', ')}. Why do this first?</span>
                <input aria-label="Reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. That plate was already down" />
                <button type="submit" disabled={!reason.trim()}>
                  Mark done anyway
                </button>
                <button type="button" onClick={() => setReasonFor(null)}>
                  Cancel
                </button>
              </form>
            )}
          </li>
        ))}
      </ol>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          commit((p) => addCustomTask(p, show.id, own.title, phase, own.after || undefined, own.required));
          setOwn({ title: '', after: '', required: false });
        }}
      >
        <input aria-label="New task" placeholder={phase === 'setup' ? 'Own task, e.g. Plug in ride power' : 'Own task, e.g. Unplug ride power'} value={own.title} onChange={(e) => setOwn({ ...own, title: e.target.value })} />
        <select aria-label="After" value={own.after} onChange={(e) => setOwn({ ...own, after: e.target.value })}>
          <option value="">At the end</option>
          {views.map((t) => (
            <option key={t.key} value={t.key}>
              After: {t.title}
            </option>
          ))}
        </select>
        {own.after && (
          <label className="check small">
            <input type="checkbox" checked={own.required} onChange={(e) => setOwn({ ...own, required: e.target.checked })} />
            Must be after
          </label>
        )}
        <button type="submit" disabled={!own.title.trim()}>
          Add task
        </button>
      </form>
      <p className="muted small">Tasks come from the layout: place each plate and feature (left to right), then put out the setup-marker things on it. Pieces built onto plates aren’t tasks. Things left out of this show aren’t listed.</p>
      <button type="button" className="link" onClick={() => store.getState().set({ setupDialog: null, showsDialog: show.id })}>
        ← Back to the show
      </button>
    </>
  );
}

function HelpersTab({ store, show, project, me }: { store: EditorStore; show: Show; project: Project; me: string }) {
  const commit = store.getState().commit;
  const [name, setName] = useState('');
  const [issue, setIssue] = useState('');
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({});
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const sendProgress = () => {
    const f = progressFile(store.getState().project, show.id, me);
    if (!f) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(f)], { type: 'application/json' }));
    a.download = `${show.name.replace(/[^\w -]+/g, '')} - progress from ${(me || 'helper').replace(/[^\w -]+/g, '')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="helpers">
      <section>
        <h3>Helpers</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            commit((p) => addHelper(p, show.id, name));
            setName('');
          }}
        >
          <input aria-label="Helper name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={!name.trim()}>
            Add helper
          </button>
        </form>
        <div className="chips">
          {show.setup.helpers.map((h) => (
            <span key={h} className="chip-static">
              {h}{' '}
              <button type="button" className="link" aria-label={`Remove helper ${h}`} onClick={() => commit((p) => removeHelper(p, show.id, h))}>
                ×
              </button>
            </span>
          ))}
        </div>
      </section>
      <section>
        <h3>Helpers on their own phone or tablet</h3>
        <p className="small">
          1. Send them this layout as a file (Projects → More → Export file) and they open it in the app. 2. They tick tasks — no internet needed — and use <strong>Send my progress</strong>. 3. You use <strong>Add a helper’s progress…</strong> here. If you both changed the same task differently, you choose.
        </p>
        <div className="actions wrap">
          <button type="button" onClick={sendProgress}>
            Send my progress
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Add a helper’s progress…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Helper progress file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const pl = planMerge(store.getState().project, await f.text());
                if (!pl.conflicts.length) {
                  commit((p) => applyMerge(p, pl, {}, me));
                  setMessage(`Added ${pl.from}’s progress: ${pl.taken.length} task(s) updated.`);
                } else {
                  setChoices(Object.fromEntries(pl.conflicts.map((c) => [c.key, 'theirs'])));
                  setPlan(pl);
                }
              } catch (err) {
                setMessage(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </div>
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
        {plan && (
          <div className="design-box outdated">
            <strong className="small">
              {plan.from} and you both changed {plan.conflicts.length} task{plan.conflicts.length === 1 ? '' : 's'}. Choose which to keep:
            </strong>
            {plan.conflicts.map((c) => (
              <div key={c.key} className="small conflict">
                <span>{c.title}</span>
                <label className="check">
                  <input type="radio" name={c.key} checked={choices[c.key] === 'mine'} onChange={() => setChoices({ ...choices, [c.key]: 'mine' })} />
                  Mine: {c.mine?.status ?? 'open'}
                  {c.mine?.helper ? ` (${c.mine.helper})` : ''}
                </label>
                <label className="check">
                  <input type="radio" name={c.key} checked={choices[c.key] === 'theirs'} onChange={() => setChoices({ ...choices, [c.key]: 'theirs' })} />
                  {plan.from}’s: {c.theirs?.status ?? 'open'}
                  {c.theirs?.by ? ` by ${c.theirs.by}` : ''}
                </label>
              </div>
            ))}
            <div className="actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  commit((p) => applyMerge(p, plan, choices, me));
                  setMessage(`Added ${plan.from}’s progress.`);
                  setPlan(null);
                }}
              >
                Merge
              </button>
              <button type="button" onClick={() => setPlan(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
      <section>
        <h3>Log</h3>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            commit((p) => logIssue(p, show.id, me, issue));
            setIssue('');
          }}
        >
          <input aria-label="Issue" placeholder="Report an issue or change, e.g. Ferris wheel motor stalled — swapped battery box" value={issue} onChange={(e) => setIssue(e.target.value)} />
          <button type="submit" disabled={!issue.trim()}>
            Add to log
          </button>
        </form>
        <ol className="history" reversed>
          {[...show.setup.log].reverse().map((l) => (
            <li key={l.id}>
              <span className="muted small">{time(l.at)}</span> <strong>{l.who}</strong> <span className={`kind ${l.kind}`}>{l.kind}</span> {l.text}
            </li>
          ))}
        </ol>
        {project.shows.length > 0 && <p className="muted small">The log stays with the show as its history.</p>}
      </section>
    </div>
  );
}

/** Printable guide: the tasks in order with tick boxes, then a map of each module with its things. */
function guideHtml(p: Project, show: Show, views: TaskView[], phase: Phase): string {
  const tasks = views.filter((t) => t.phase === phase);
  const rows = tasks
    .map((t, i) => `<tr><td>${i + 1}</td><td><span class="box"></span></td><td><strong>${esc(t.title)}</strong>${t.details.length ? `<br><small>${esc(t.details.join(', '))}</small>` : ''}</td><td>${esc(t.helper ?? '')}</td></tr>`)
    .join('');
  const maps = tasks
    .filter((t) => t.kind === 'loose' && t.itemId)
    .map((t) => {
      const m = findItem(p, t.itemId!);
      if (!m) return '';
      const f = footprint(m);
      const things = looseOn(p, m.id);
      return `<div class="map"><h3>${esc(t.title.replace(/^(Put out|Pack up) the things on /, ''))}</h3>${overheadSvg(p, { levelId: m.levelId, bounds: f, itemLabels: true, standalone: true })}<small>${esc(things.map((o) => o.name).join(', '))}</small></div>`;
    })
    .join('');
  const style = `body{font-family:system-ui,sans-serif;margin:10mm;color:#111}h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #999;padding:4px 6px;vertical-align:top}.box{width:14px;height:14px;border:1.5px solid #111;display:inline-block}.maps{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin-top:8mm}.map{break-inside:avoid}.map h3{font-size:13px;margin:0 0 2mm}.map svg{width:100%;height:auto;border:1px solid #999}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(show.name)} — ${phase}</title><style>${style}</style></head><body><h1>${esc(p.name)} — ${phase} at ${esc(show.name)} (${esc(show.start)})</h1><table><thead><tr><th>#</th><th>Done</th><th>Task</th><th>Who</th></tr></thead><tbody>${rows}</tbody></table>${
    maps ? `<h2 style="font-size:15px;margin-top:8mm">Where the things go</h2><div class="maps">${maps}</div>` : ''
  }</body></html>`;
}
