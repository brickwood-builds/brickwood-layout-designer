// The Plan menu: one row per planning tool that's switched on for this layout, each with a
// one-line status, so you can see at a glance what needs doing. Picking one closes the menu.
import { useStore } from 'zustand';
import { useEffect, type ReactNode } from 'react';
import type { EditorStore } from '../editor/store';
import { activeContainers, addContainer, containerLabel, containerOf, contentsOf, itemName, packItems, unpackItems, unpacked } from '../domain/packing';
import { findItem, isModule, type Item } from '../domain/edits';
import type { Container, Project } from '../domain/schema';
import { HeightFilter, HeightShadingToggle, OPTIONS, setFeature } from '../editor/OptionsMenu';
import { Icon } from './icons';

export type PlanTool = 'parts' | 'versions';
const today = () => new Date().toISOString().slice(0, 10);
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function PlanMenu({ store, maxTop, onTool, onChoose, onClose }: { store: EditorStore; maxTop: number; onTool: (t: PlanTool) => void; onChoose: () => void; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const f = project.features;
  const set = store.getState().set;
  const open = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const builds = project.builds.filter((b) => b.status !== 'replaced').length;
  const left = f.transport ? unpacked(project).length : 0;
  const shows = [...project.shows].filter((x) => !x.done).sort((a, b) => a.start.localeCompare(b.start));
  const next = shows.find((x) => x.end >= today()) ?? shows[shows.length - 1];
  const any = f.inventory || f.versions || f.builds || f.transport || f.exhibitions || f.helpers || f.heights;
  return (
    <div className="nx-pop nx-plan" role="dialog" aria-label="Plan">
      {f.inventory && <Row icon="list" title="Parts list" sub="What it needs, what you have, what to buy" onClick={open(() => onTool('parts'))} />}
      {f.versions && <Row icon="history" title="Versions" sub="Save a version, compare, see what changed" onClick={open(() => onTool('versions'))} />}
      {f.builds && <Row icon="tag" title="Builds" sub={builds ? `${builds} physical build${builds === 1 ? '' : 's'}` : 'None yet — give a real build an ID'} onClick={open(() => set({ buildDialog: 'list' }))} />}
      {f.transport && <Row icon="box" title="Packing" sub={left ? `${left} thing${left === 1 ? '' : 's'} still to pack` : project.containers.length ? 'Everything is in a box' : 'No boxes yet'} warn={left > 0} onClick={open(() => set({ packingDialog: 'list' }))} />}
      {f.exhibitions && <Row icon="calendar" title="Shows" sub={next ? `Next: ${next.name}, ${day(next.start)}` : 'No shows planned'} onClick={open(() => set({ showsDialog: 'list' }))} />}
      {f.helpers && (
        <Row icon="people" title="Setup and helpers" sub={next ? `Plan for ${next.name}` : 'Add a show first'} onClick={open(() => set(next ? { setupDialog: next.id } : { showsDialog: 'list' }))} />
      )}
      {f.heights && (
        <div className="nx-plan-heights" role="group" aria-label="Heights">
          <span className="nx-plan-label">
            <Icon name="mountain" /> Heights
          </span>
          <HeightShadingToggle store={store} maxTop={maxTop} />
          <HeightFilter store={store} maxTop={maxTop} />
        </div>
      )}
      {!any && <p className="nx-muted">Planning tools — parts list and shopping, versions, builds, packing, shows, heights — are switched on per layout, so a layout stays simple until you need them.</p>}
      <div className="nx-plan-foot">
        <button type="button" className="nx-btn nx-plan-choose" onClick={open(onChoose)}>
          {any ? 'Choose tools…' : 'Choose tools to switch on…'}
        </button>
      </div>
    </div>
  );
}

function Row({ icon, title, sub, warn, onClick }: { icon: string; title: string; sub: ReactNode; warn?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="nx-plan-row" onClick={onClick}>
      <span className="nx-plan-icon">
        <Icon name={icon} />
      </span>
      <span className="nx-grow">
        <strong>{title}</strong>
        <span className={`nx-plan-sub ${warn ? 'nx-warn-text' : ''}`}>{sub}</span>
      </span>
      <Icon name="chevron" size={16} />
    </button>
  );
}

/** Which planning tools this layout uses. Each stays out of the way until switched on. */
export function ToolsSheet({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const features = useStore(store, (s) => s.project.features);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="nx-scrim" onClick={onClose}>
      <div className="nx-sheet nx-tools-sheet" role="dialog" aria-label="Planning tools" onClick={(e) => e.stopPropagation()}>
        <h2>Planning tools</h2>
        <p className="nx-muted">Switch on what this layout needs. They show up in the Plan menu, and stay out of the way until you do.</p>
        <div className="nx-tools-list">
          {OPTIONS.map((o) => (
            <label key={o.key} className="nx-tool-opt">
              <input type="checkbox" role="switch" checked={features[o.key]} onChange={(e) => setFeature(store, o.key, e.target.checked)} aria-label={o.label} />
              <span>
                <strong>{o.label}</strong>
                <span className="nx-plan-sub">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="nx-row nx-end">
          <button type="button" className="nx-btn nx-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** What in the selection can go in a box: modules and features. */
export function packable(project: Project, selection: string[]): Item[] {
  return selection.map((id) => findItem(project, id)).filter((i): i is Item => !!i && (isModule(i) || i.type === 'footprint'));
}

/** Put the selected modules and features in a box, tote or board (or take them out). */
export function PutInSheet({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const project = useStore(store, (s) => s.project);
  const selection = useStore(store, (s) => s.selection);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const things = packable(project, selection);
  const ids = things.map((i) => i.id);
  const inside = [...new Set(things.map((i) => containerOf(project, i.id)).filter((c): c is Container => !!c))];
  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <div className="nx-scrim" onClick={onClose}>
      <div className="nx-sheet nx-tools-sheet" role="dialog" aria-label="Put in a box" onClick={(e) => e.stopPropagation()}>
        <h2>{inside.length ? 'Move to another box' : 'Put in a box'}</h2>
        <p className="nx-muted">
          {things.length === 1 ? itemName(things[0]!) : `${things.length} things`}
          {inside.length > 0 && ` — now in ${inside.map(containerLabel).join(', ')}`}
        </p>
        <div className="nx-tools-list">
          {activeContainers(project).map((c) => (
            <button key={c.id} type="button" className="nx-plan-row" disabled={inside.length === 1 && inside[0]!.id === c.id} onClick={done(() => store.getState().commit((p) => packItems(p, c.id, ids)))}>
              <span className="nx-plan-icon">
                <Icon name="box" />
              </span>
              <span className="nx-grow">
                <strong>{containerLabel(c)}</strong>
                <span className="nx-plan-sub">{contentsOf(project, c).length} inside</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            className="nx-plan-row"
            onClick={done(() => {
              let id = '';
              store.getState().commit((p) => {
                const r = addContainer(p, { kind: 'tote' });
                id = r.id;
                return packItems(r.project, r.id, ids);
              });
              store.getState().set({ packingDialog: id });
            })}
          >
            <span className="nx-plan-icon">
              <Icon name="plus" />
            </span>
            <span className="nx-grow">
              <strong>A new tote</strong>
              <span className="nx-plan-sub">Then name it and set its size</span>
            </span>
          </button>
        </div>
        <div className="nx-row nx-end">
          {inside.length > 0 && (
            <button type="button" className="nx-btn" onClick={done(() => store.getState().commit((p) => unpackItems(p, ids)))}>
              Take out (not packed)
            </button>
          )}
          <button type="button" className="nx-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
