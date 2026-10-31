import { useStore } from 'zustand';
import { LegoColorPicker } from '../ui/LegoColorPicker';
import { finishCurve, itemLayerId } from './actions';
import { designIdOf, drawSources, isStamping, type DrawSettings, type StairDraft } from './drawTool';
import { partByKey, type PartKind } from '../domain/catalog';
import type { Turn } from '../domain/stamps';
import type { EditorStore } from './store';

const PART_KINDS: PartKind[] = ['round plate', 'plate', 'tile', 'round tile', 'brick', 'round brick'];
const WIDTHS = [1, 2, 3, 4, 6, 8];
const SPACINGS = [0, 2, 3, 4, 6, 8, 12, 16];
const TURNS: [Turn, string][] = [
  [0, 'None'],
  [90, '90°'],
  [180, '180°'],
  [270, '270°'],
  ['follow', 'Follow path'],
];

/** A row of toggle buttons. */
function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([k, text]) => (
          <button key={String(k)} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Draw mode: what to paint, colour, brush or spacing, shape (incl. curve and stairs), and erase. */
export function DrawPanel({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const draw = useStore(store, (s) => s.draw);
  const draft = useStore(store, (s) => s.curveDraft);
  useStore(store, (s) => s.activeLayerId);
  const set = (patch: Partial<DrawSettings>) => store.getState().set({ draw: { ...draw, ...patch } });
  const setStair = (patch: Partial<StairDraft>) => set({ stair: { ...draw.stair, ...patch } });
  const sources = drawSources(project);
  const parts = sources.filter((s) => s.key.startsWith('part:'));
  const own = sources.filter((s) => s.key.startsWith('shape:'));
  const layer = project.layers.find((l) => l.id === itemLayerId(store));
  const stairs = draw.shape === 'stairs';
  const design = designIdOf(draw) ? project.designs.find((d) => d.id === designIdOf(draw)) : undefined;
  const stamping = isStamping(draw);
  const pointByPoint = draw.shape === 'curve' || stairs;

  const intro = stairs
    ? 'Click (or tap) where the stairs start, then where they turn and end — they go up from the first point. Finish with a double-click, Enter or “Finish stairs”.'
    : draw.shape === 'curve'
      ? 'Click (or tap) the points the curve should pass through. Finish with a double-click, Enter or “Finish curve”. Dragging moves the view.'
      : stamping
        ? 'Drag on the table: one is placed every few studs along the stroke (a grid for Fill box). A single click places one. Each stroke is one Undo.'
        : 'Drag on the table to paint — for example a walkway of 1×1 round plates. Each stroke is one Undo.';

  return (
    <aside className="props" aria-label="Properties">
      <h2>Draw</h2>
      <p className="muted small">{intro}</p>
      <Seg
        label="Shape"
        value={draw.shape}
        options={[
          ['free', 'Freehand'],
          ['line', 'Straight'],
          ['box', 'Fill box'],
          ['curve', 'Curve'],
          ['stairs', 'Stairs'],
        ]}
        onChange={(shape) => set({ shape })}
      />
      {stairs ? (
        <>
          <LegoColorPicker label="Colour" value={draw.color} onChange={(hex) => hex && set({ color: hex })} />
          <Seg label="Stairs width (studs)" value={draw.stair.width} options={[2, 3, 4, 6, 8].map((w) => [w, String(w)])} onChange={(width) => setStair({ width })} />
          <Seg label="Step depth (studs)" value={draw.stair.stepDepth} options={[1, 2, 3, 4].map((w) => [w, String(w)])} onChange={(stepDepth) => setStair({ stepDepth })} />
          <Seg
            label="Each step goes up"
            value={draw.stair.risePlates}
            options={[
              [1, '1 plate'],
              [2, '2 plates'],
              [3, '1 brick'],
            ]}
            onChange={(risePlates) => setStair({ risePlates })}
          />
          <label className="field">
            <span>Start height (plates above what it sits on)</span>
            <input
              aria-label="Start height (plates)"
              type="number"
              min={0}
              step={1}
              value={draw.stair.startPlates}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) setStair({ startPlates: v });
              }}
            />
          </label>
          <Seg
            label="Landings"
            value={draw.stair.landingEvery}
            options={[
              [0, 'At turns'],
              [4, 'Every 4 steps'],
              [6, 'Every 6'],
              [8, 'Every 8'],
            ]}
            onChange={(landingEvery) => setStair({ landingEvery })}
          />
          <label className="check">
            <input type="checkbox" checked={draw.stair.smooth} onChange={(e) => setStair({ smooth: e.target.checked })} />
            Smooth tops (tiles)
          </label>
          {!project.features.heights && <p className="muted small">Tip: turn on Heights in the ⋯ menu to see and change how high each step is.</p>}
        </>
      ) : (
        <>
          <label className="field">
            <span>Draw with</span>
            <select
              aria-label="Draw with"
              value={draw.source}
              onChange={(e) => {
                const src = sources.find((s) => s.key === e.target.value);
                if (src) set({ source: src.key, color: src.template.color });
                else set({ source: e.target.value });
              }}
            >
              {PART_KINDS.map((kind) => (
                <optgroup key={kind} label={`Single pieces — ${kind}s`}>
                  {parts
                    .filter((s) => partByKey(s.key.slice(5))?.kind === kind)
                    .map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                </optgroup>
              ))}
              {own.length > 0 && (
                <optgroup label="This project">
                  {own.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {project.designs.length > 0 && (
                <optgroup label="Designs (stamp copies)">
                  {project.designs.map((d) => (
                    <option key={d.id} value={`design:${d.id}`}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {!design && <LegoColorPicker label="Colour" value={draw.color} onChange={(hex) => hex && set({ color: hex })} />}
          <Seg
            label="Spacing (studs apart)"
            value={draw.spacing}
            options={SPACINGS.map((n) => [n, n === 0 ? (design ? 'Touching' : 'Solid') : String(n)])}
            onChange={(spacing) => set({ spacing })}
          />
          {!stamping && <Seg label="Brush width (studs)" value={draw.width} options={WIDTHS.map((w) => [w, String(w)])} onChange={(width) => set({ width })} />}
          {stamping && <Seg label="Turn" value={draw.turn} options={TURNS} onChange={(turn) => set({ turn })} />}
          {!design && <p className="muted small">To stamp a group of things (a bench with a lamp), save it as a design, then pick it in Draw with.</p>}
        </>
      )}
      {pointByPoint && (
        <div className="design-box">
          <span className="small">{draft?.length ? `${draft.length} point${draft.length === 1 ? '' : 's'} so far.` : 'No points yet.'}</span>
          <div className="actions">
            <button type="button" className="primary" disabled={(draft?.length ?? 0) < 2} onClick={() => finishCurve(store)}>
              {stairs ? 'Finish stairs' : 'Finish curve'}
            </button>
            <button type="button" disabled={!draft?.length} onClick={() => store.getState().set({ curveDraft: draft && draft.length > 1 ? draft.slice(0, -1) : null })}>
              Remove last point
            </button>
            <button type="button" disabled={!draft?.length} onClick={() => store.getState().set({ curveDraft: null })}>
              Cancel
            </button>
          </div>
          <span className="muted small">To change it later: Select it, then “{stairs ? 'Edit path' : 'Edit curve'}”.</span>
        </div>
      )}
      {!stairs && (
        <>
          <div className="field">
            <span>Where something is already there</span>
            <div className="seg" role="group" aria-label="Where something is already there">
              <button type="button" aria-pressed={draw.whenTaken === 'skip'} onClick={() => set({ whenTaken: 'skip' })} title="Leave it — painting over a walkway never doubles it up">
                Leave it
              </button>
              <button type="button" aria-pressed={draw.whenTaken === 'stack'} onClick={() => set({ whenTaken: 'stack' })} title="Stack on top — build up a slope or hill layer by layer">
                Stack on top
              </button>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={draw.erase} onChange={(e) => set({ erase: e.target.checked })} />
            Erase instead (removes things on this layer under the brush)
          </label>
        </>
      )}
      <p className="muted small">
        Draws on layer <strong>{layer?.name}</strong> — change it in Layers (“New items”).{' '}
        {stairs ? '' : stamping ? 'Red spots are already taken and are skipped.' : draw.whenTaken === 'stack' ? 'Painting over what’s there adds a layer on top.' : 'Painting over what’s already there doesn’t double it up.'}
      </p>
    </aside>
  );
}
