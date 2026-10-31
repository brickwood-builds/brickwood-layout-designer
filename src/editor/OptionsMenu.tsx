import { useState } from 'react';
import { useKeepInView } from '../ui/useKeepInView';
import { useStore } from 'zustand';
import type { Features } from '../domain/schema';
import type { EditorStore } from './store';

/** Advanced areas stay hidden until switched on here (owner rule: the app must feel basic). */
const OPTIONS: { key: keyof Features; label: string; hint: string }[] = [
  { key: 'heights', label: 'Heights', hint: 'Building heights, automatic stacking, a height filter and shelf clearance warnings' },
];

export function OptionsMenu({ store }: { store: EditorStore }) {
  const features = useStore(store, (s) => s.project.features);
  const [open, setOpen] = useState(false);
  const popRef = useKeepInView<HTMLDivElement>(open);
  return (
    <div className="popover-wrap">
      <button type="button" aria-label="More tools" aria-expanded={open} title="More tools (switch on advanced features)" onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <div ref={popRef} className="popover options-pop" role="dialog" aria-label="More tools">
          <span className="muted small">Switch on extra tools for this project. They stay out of the way until you do.</span>
          {OPTIONS.map((o) => (
            <label key={o.key} className="check option">
              <input
                type="checkbox"
                checked={features[o.key]}
                onChange={(e) => store.getState().commit((p) => ({ ...p, features: { ...p.features, [o.key]: e.target.checked } }))}
              />
              <span>
                <strong>{o.label}</strong>
                <br />
                <span className="muted small">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Status-bar height filter: show only things that sit below a height. */
export function HeightFilter({ store, maxTop }: { store: EditorStore; maxTop: number }) {
  const limit = useStore(store, (s) => s.heightLimit);
  const max = Math.max(3, Math.ceil(maxTop));
  return (
    <label className="tool-select height-filter" title="Hide things that sit at or above this height, to see what's underneath">
      Show up to
      <input
        type="range"
        min={0}
        max={max + 1}
        step={1}
        value={limit ?? max + 1}
        onChange={(e) => {
          const v = Number(e.target.value);
          store.getState().set({ heightLimit: v > max ? null : v });
        }}
        aria-label="Show things that sit below this height"
      />
      <span className="muted">{limit === null ? 'all' : `${limit} plates`}</span>
    </label>
  );
}
