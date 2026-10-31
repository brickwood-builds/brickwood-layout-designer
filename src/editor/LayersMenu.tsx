import { useState } from 'react';
import { useKeepInView } from '../ui/useKeepInView';
import { useStore } from 'zustand';
import { addLayer, allItems, canDeleteLayer, deleteLayer, moveLayer, moveToLayer, updateLayer } from '../domain/edits';
import { itemLayerId } from './actions';
import type { EditorStore } from './store';

/**
 * Toolbar popover. Layers stack bottom to top (▲▼ changes the order); "New items" picks the
 * layer new markers and items go on. MILS IDs can be hidden like a layer, and "Finished
 * look" shows plates in their real colour.
 */
export function LayersMenu({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  useStore(store, (s) => s.activeLayerId);
  const [open, setOpen] = useState(false);
  const popRef = useKeepInView<HTMLDivElement>(open);
  const layers = [...project.layers].sort((a, b) => b.order - a.order); // top of the stack first
  const counts = new Map<string, number>();
  for (const i of allItems(project)) counts.set(i.layerId, (counts.get(i.layerId) ?? 0) + 1);
  const s = store.getState();
  const active = itemLayerId(store);
  const settings = project.settings;
  const setSetting = (patch: Partial<typeof settings>) => s.commit((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  /** Hidden or locked layers can't stay selected. */
  const dropUneditable = () => {
    const st = store.getState();
    const ok = new Set(st.project.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
    const keep = allItems(st.project).filter((i) => st.selection.includes(i.id) && ok.has(i.layerId)).map((i) => i.id);
    if (keep.length !== st.selection.length) st.select(keep);
  };

  return (
    <div className="popover-wrap">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} title="Layers, MILS IDs and finished look">
        Layers
      </button>
      {open && (
        <div ref={popRef} className="popover layers-pop" role="dialog" aria-label="Layers">
          <table className="layers">
            <thead>
              <tr>
                <th>Show</th>
                <th>Lock</th>
                <th title="New markers and items go on this layer">New items</th>
                <th>Layer (top of the stack first)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr className="pseudo-layer">
                <td>
                  <input type="checkbox" aria-label="Show MILS IDs and names" checked={settings.showLabels} onChange={(e) => setSetting({ showLabels: e.target.checked })} />
                </td>
                <td />
                <td />
                <td>MILS IDs & names</td>
                <td />
              </tr>
              {layers.map((l, idx) => (
                <tr key={l.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Show ${l.name}`}
                      checked={l.visible}
                      onChange={(e) => {
                        s.commit((p) => updateLayer(p, l.id, { visible: e.target.checked }));
                        dropUneditable();
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Lock ${l.name}`}
                      checked={l.locked}
                      onChange={(e) => {
                        s.commit((p) => updateLayer(p, l.id, { locked: e.target.checked }));
                        dropUneditable();
                      }}
                    />
                  </td>
                  <td>
                    <input type="radio" name="active-layer" aria-label={`New items go on ${l.name}`} checked={active === l.id} onChange={() => s.set({ activeLayerId: l.id })} />
                  </td>
                  <td>
                    <input
                      key={l.name}
                      className="layer-name"
                      defaultValue={l.name}
                      aria-label="Layer name"
                      onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && s.commit((p) => updateLayer(p, l.id, { name: e.target.value.trim() }))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    <small className="muted"> {counts.get(l.id) ?? 0}</small>
                  </td>
                  <td className="layer-actions">
                    <button type="button" className="icon" aria-label={`Move ${l.name} up`} disabled={idx === 0} onClick={() => s.commit((p) => moveLayer(p, l.id, 1))}>
                      ▲
                    </button>
                    <button type="button" className="icon" aria-label={`Move ${l.name} down`} disabled={idx === layers.length - 1} onClick={() => s.commit((p) => moveLayer(p, l.id, -1))}>
                      ▼
                    </button>
                    {selection.length > 0 && (
                      <button type="button" title="Move the selection to this layer" onClick={() => s.commit((p) => moveToLayer(p, selection, l.id))}>
                        Move here
                      </button>
                    )}
                    {canDeleteLayer(project, l.id) && (
                      <button type="button" className="icon" aria-label={`Delete ${l.name}`} onClick={() => s.commit((p) => deleteLayer(p, l.id))}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="layers-footer">
            <button type="button" onClick={() => s.commit((p) => addLayer(p, '').project)}>+ Add layer</button>
            <label className="check" title="Show each plate in its real LEGO colour, like the finished display">
              <input type="checkbox" checked={settings.moduleColors === 'plate'} onChange={(e) => setSetting({ moduleColors: e.target.checked ? 'plate' : 'size' })} />
              Finished look (real plate colours)
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
