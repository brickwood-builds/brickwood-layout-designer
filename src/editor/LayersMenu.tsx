import { useState } from 'react';
import { useStore } from 'zustand';
import { addLayer, allItems, canDeleteLayer, deleteLayer, moveToLayer, updateLayer } from '../domain/edits';
import type { EditorStore } from './store';

/** Toolbar popover: show/hide and lock layers, rename, add, and move the selection to a layer. */
export function LayersMenu({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  const [open, setOpen] = useState(false);
  const layers = [...project.layers].sort((a, b) => a.order - b.order);
  const counts = new Map<string, number>();
  for (const i of allItems(project)) counts.set(i.layerId, (counts.get(i.layerId) ?? 0) + 1);
  const s = store.getState();

  /** Hidden or locked layers can't stay selected. */
  const dropUneditable = () => {
    const st = store.getState();
    const ok = new Set(st.project.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
    const keep = allItems(st.project).filter((i) => st.selection.includes(i.id) && ok.has(i.layerId)).map((i) => i.id);
    if (keep.length !== st.selection.length) st.select(keep);
  };

  return (
    <div className="popover-wrap">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} title="Show, hide and lock layers">
        Layers
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Layers">
          <table className="layers">
            <thead>
              <tr>
                <th>Show</th>
                <th>Lock</th>
                <th>Layer</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {layers.map((l) => (
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
                    <input
                      className="layer-name"
                      key={l.name}
                      defaultValue={l.name}
                      aria-label="Layer name"
                      onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && s.commit((p) => updateLayer(p, l.id, { name: e.target.value.trim() }))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    <small className="muted"> {counts.get(l.id) ?? 0}</small>
                  </td>
                  <td>
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
          <button type="button" onClick={() => s.commit((p) => addLayer(p, '').project)}>+ Add layer</button>
        </div>
      )}
    </div>
  );
}
