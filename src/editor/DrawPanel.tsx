import { useStore } from 'zustand';
import { LegoColorPicker } from '../ui/LegoColorPicker';
import { itemLayerId } from './actions';
import { drawSources } from './drawTool';
import type { EditorStore } from './store';

const WIDTHS = [1, 2, 3, 4, 6, 8];

/** Draw mode: what to paint, colour, brush width, freehand / line / box, and erase. */
export function DrawPanel({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const draw = useStore(store, (s) => s.draw);
  useStore(store, (s) => s.activeLayerId);
  const set = (patch: Partial<typeof draw>) => store.getState().set({ draw: { ...draw, ...patch } });
  const sources = drawSources(project);
  const parts = sources.filter((s) => s.key.startsWith('part:'));
  const own = sources.filter((s) => s.key.startsWith('shape:'));
  const layer = project.layers.find((l) => l.id === itemLayerId(store));
  return (
    <aside className="props" aria-label="Properties">
      <h2>Draw</h2>
      <p className="muted small">Drag on the table to paint — for example a walkway of 1×1 round plates. Each stroke is one Undo.</p>
      <label className="field">
        <span>Draw with</span>
        <select
          aria-label="Draw with"
          value={draw.source}
          onChange={(e) => {
            const src = sources.find((s) => s.key === e.target.value)!;
            set({ source: src.key, color: src.template.color });
          }}
        >
          <optgroup label="Single pieces">
            {parts.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </optgroup>
          {own.length > 0 && (
            <optgroup label="This project">
              {own.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <LegoColorPicker label="Colour" value={draw.color} onChange={(hex) => hex && set({ color: hex })} />
      <div className="field">
        <span>Brush width (studs)</span>
        <div className="seg" role="group" aria-label="Brush width">
          {WIDTHS.map((w) => (
            <button key={w} type="button" aria-pressed={draw.width === w} onClick={() => set({ width: w })}>
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Shape</span>
        <div className="seg" role="group" aria-label="Shape">
          {(
            [
              ['free', 'Freehand'],
              ['line', 'Straight'],
              ['box', 'Fill box'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={draw.shape === k} onClick={() => set({ shape: k })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={draw.erase} onChange={(e) => set({ erase: e.target.checked })} />
        Erase instead (removes things on this layer under the brush)
      </label>
      <p className="muted small">
        Draws on layer <strong>{layer?.name}</strong> — change it in Layers (“New items”). Painting over what’s already there doesn’t double it up.
      </p>
    </aside>
  );
}
