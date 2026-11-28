// Trial interface: the cards for Draw, Erase and drawing a shape. Just the usual choices,
// with "More options" for the rest (spacing, stacking, stairs) from the app's full panel.
import { useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { EditorStore } from '../editor/store';
import { drawSources, type DrawSettings } from '../editor/drawTool';
import { finishCurve } from '../editor/actions';
import { DrawPanel } from '../editor/DrawPanel';
import { partByKey } from '../domain/catalog';
import { LegoColorPicker } from '../ui/LegoColorPicker';
import { Icon } from './icons';

const WIDTHS = [1, 2, 3, 4, 6, 8];
/** The pieces walkways and fills use most, as quick picks. */
const QUICK = ['round-1x1', 'plate-1x1', 'plate-1x2', 'plate-2x2', 'tile-1x1', 'tile-2x2'];

function Chips<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="nx-field">
      <span>{label}</span>
      <div className="nx-chips nx-chips-tight" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" className={`nx-chip ${value === v ? 'nx-on' : ''}`} aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({ title, store, children }: { title: string; store: EditorStore; children: ReactNode }) {
  // Folded down to its title, so it doesn't cover the part of the layout being drawn on.
  const [folded, setFolded] = useState(false);
  return (
    <aside className={`nx-card-panel nx-tool-card ${folded ? 'nx-folded' : ''}`} aria-label={title}>
      <div className="nx-card-head">
        <strong>{title}</strong>
        <span className="nx-row">
          <button type="button" className="nx-icon-btn" onClick={() => setFolded(!folded)} aria-label={folded ? `Show ${title} options` : `Fold away ${title} options`} aria-expanded={!folded} title={folded ? 'Show the options' : 'Fold away (keeps drawing)'}>
            <Icon name={folded ? 'plus' : 'minus'} />
          </button>
          <button type="button" className="nx-icon-btn" onClick={() => store.getState().set({ mode: 'select', curveDraft: null })} aria-label={`Stop: ${title}`} title="Stop (Esc)">
            <Icon name="close" />
          </button>
        </span>
      </div>
      {!folded && children}
    </aside>
  );
}

/** Points so far, with Finish / Undo point / Cancel (curves and shapes). */
function PointControls({ store, min, finishLabel }: { store: EditorStore; min: number; finishLabel: string }) {
  const draft = useStore(store, (s) => s.curveDraft);
  const n = draft?.length ?? 0;
  return (
    <div className="nx-points">
      <span className="nx-muted">{n ? `${n} point${n === 1 ? '' : 's'} so far` : 'Click on the table to start'}</span>
      <div className="nx-row">
        <button type="button" className="nx-btn nx-primary" disabled={n < min} onClick={() => finishCurve(store)}>
          {finishLabel}
        </button>
        <button type="button" className="nx-btn" disabled={!n} onClick={() => store.getState().set({ curveDraft: draft && draft.length > 1 ? draft.slice(0, -1) : null })} title="Take back the last point">
          <Icon name="undo" />
        </button>
        <button type="button" className="nx-btn" disabled={!n} onClick={() => store.getState().set({ curveDraft: null })}>
          Clear
        </button>
      </div>
    </div>
  );
}

export function DrawCard({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const draw = useStore(store, (s) => s.draw);
  const [more, setMore] = useState(false);
  const set = (patch: Partial<DrawSettings>) => store.getState().set({ draw: { ...draw, ...patch } });
  const sources = drawSources(project);
  const pick = (key: string) => {
    const src = sources.find((x) => x.key === key);
    if (src) set({ source: key, color: src.template.color });
  };
  const shape = draw.shape === 'stairs' || draw.shape === 'outline' ? 'free' : draw.shape;
  if (more)
    return (
      <Card title="Draw" store={store}>
        <button type="button" className="nx-link" onClick={() => setMore(false)}>
          ← Fewer options
        </button>
        <DrawPanel store={store} />
      </Card>
    );
  return (
    <Card title="Draw" store={store}>
      <p className="nx-muted">Drag on the table to paint pieces — a walkway, a lawn. Each stroke is one Undo.</p>
      <div className="nx-field">
        <span>Draw with</span>
        <div className="nx-quick" role="group" aria-label="Draw with">
          {QUICK.map((k) => {
            const part = partByKey(k)!;
            const key = `part:${k}`;
            return (
              <button key={k} type="button" className={`nx-quick-btn ${draw.source === key ? 'nx-on' : ''}`} aria-pressed={draw.source === key} onClick={() => pick(key)} title={part.name} aria-label={part.name}>
                <span className={`nx-swatch ${part.round ? 'round' : ''}`} style={{ background: draw.source === key ? draw.color : part.color, aspectRatio: `${part.width} / ${part.depth}` }} />
                <span>{part.name.replace('Plate ', '').replace('Round ', 'Round ')}</span>
              </button>
            );
          })}
        </div>
        <select aria-label="Other piece" value={QUICK.some((k) => draw.source === `part:${k}`) ? '' : draw.source} onChange={(e) => e.target.value && pick(e.target.value)}>
          <option value="">Another piece…</option>
          {sources
            .filter((x) => !QUICK.some((k) => x.key === `part:${k}`))
            .map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
        </select>
      </div>
      <LegoColorPicker label="Colour" value={draw.color} onChange={(hex) => hex && set({ color: hex })} />
      <Chips
        label="Shape"
        value={shape}
        options={[
          ['free', 'Freehand'],
          ['line', 'Straight'],
          ['box', 'Fill a box'],
          ['curve', 'Curve'],
        ]}
        onChange={(v) => set({ shape: v })}
      />
      {shape !== 'box' && <Chips label="Width (studs)" value={draw.width} options={WIDTHS.map((w) => [w, String(w)])} onChange={(width) => set({ width })} />}
      {shape === 'curve' && <PointControls store={store} min={2} finishLabel="Finish curve" />}
      <button type="button" className="nx-link" onClick={() => setMore(true)}>
        More options (spacing, stacking, stairs)…
      </button>
    </Card>
  );
}

export function EraseCard({ store }: { store: EditorStore }) {
  const draw = useStore(store, (s) => s.draw);
  const set = (patch: Partial<DrawSettings>) => store.getState().set({ draw: { ...draw, ...patch } });
  const shape = draw.shape === 'line' || draw.shape === 'box' ? draw.shape : 'free';
  return (
    <Card title="Erase" store={store}>
      <p className="nx-muted">Drag over pieces, items and markers to remove them. Plates and buildings are never erased; a locked or hidden layer is kept safe.</p>
      <Chips
        label="Shape"
        value={shape}
        options={[
          ['free', 'Freehand'],
          ['line', 'Straight'],
          ['box', 'Box'],
        ]}
        onChange={(v) => set({ shape: v })}
      />
      {shape !== 'box' && <Chips label="Width (studs)" value={draw.width} options={WIDTHS.map((w) => [w, String(w)])} onChange={(width) => set({ width })} />}
    </Card>
  );
}

/** Drawing the outline of a building or small item, corner by corner. */
export function ShapeCard({ store }: { store: EditorStore }) {
  const draw = useStore(store, (s) => s.draw);
  const set = (patch: Partial<DrawSettings>) => store.getState().set({ draw: { ...draw, ...patch } });
  const item = draw.feature.kind === 'item';
  return (
    <Card title={item ? 'Draw an item' : 'Draw a building'} store={store}>
      <p className="nx-muted">Click each corner on the table, all the way round. You can move corners afterwards.</p>
      <label className="nx-field">
        <span>Name</span>
        <input aria-label={item ? 'Item name' : 'Building name'} placeholder={item ? 'e.g. Pond' : 'e.g. Town hall'} value={draw.feature.name} onChange={(e) => set({ feature: { ...draw.feature, name: e.target.value } })} />
      </label>
      {item && <LegoColorPicker label="Colour" value={draw.feature.itemColor ?? '#a0a5a9'} onChange={(hex) => hex && set({ feature: { ...draw.feature, itemColor: hex } })} />}
      <PointControls store={store} min={3} finishLabel="Finish shape" />
    </Card>
  );
}
