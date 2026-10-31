import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { searchParts } from '../domain/catalog';
import { addShape, defaultItemLayerId, deleteShape } from '../domain/objects';
import { lego, legoColorName } from '../domain/legoColors';
import { LegoColorPicker } from '../ui/LegoColorPicker';
import { MILS_COLORS, MILS_SIZES, milsKindForSize, type MilsKind, type Shape } from '../domain/schema';
import { formatLength } from '../domain/units';
import { Modal } from '../ui/Modal';
import { addModuleAt, addObjectAt, itemLayerId, placeDesignAt, type ObjectTemplate } from './actions';
import { copiesOf, deleteDesign, isOutdated } from '../domain/designs';
import type { EditorStore } from './store';
import { toWorld } from './view';
import { KIND_LABEL } from './Panels';

type Place = (at?: { x: number; y: number }) => void;

/**
 * Palette entry: click/tap adds it near the middle of the view; dragging it onto the
 * canvas drops it where it is released. Uses pointer events so it works with a finger too.
 */
function PaletteItem({ store, place, title, children }: { store: EditorStore; place: Place; title: string; children: ReactNode }) {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.active = true;
    if (d.active) setGhost({ x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    if (!d.active) return place();
    const canvas = document.querySelector('[data-testid="canvas"]');
    const r = canvas?.getBoundingClientRect();
    if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    place(toWorld(store.getState().view, e.clientX - r.left, e.clientY - r.top));
  };

  return (
    <>
      <button
        type="button"
        title={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setGhost(null);
        }}
        // Keyboard activation (Enter/Space) arrives as a click with detail 0.
        onClick={(e) => e.detail === 0 && place()}
      >
        {children}
      </button>
      {ghost && createPortal(<div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>{children}</div>, document.body)}
    </>
  );
}

function Swatch({ color, ratio = 1, round }: { color: string; ratio?: number; round?: boolean }) {
  return <i className="swatch" style={{ background: color, aspectRatio: String(ratio), borderRadius: round ? '50%' : undefined }} />;
}

function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="palette-section" open={open}>
      <summary>{title}</summary>
      <div className="palette-items">{children}</div>
    </details>
  );
}

/** Left column: everything that can be added. Modules open; the rest folded away until needed. */
export function Palette({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const shapes = project.shapes;
  const designs = project.designs;
  const [dialog, setDialog] = useState<'module' | 'ride' | 'marker' | 'item' | 'piece' | null>(null);
  const [partQuery, setPartQuery] = useState('');
  // Each project has its own markers, items and pieces (nothing carries over between projects).
  const userMarkers = shapes.filter((sh) => sh.type === 'setupMarker');
  const userPieces = shapes.filter((sh) => sh.type === 'piece');
  const userItems = shapes.filter((sh) => sh.type === 'item' || sh.type === 'footprint');

  const shapeEntry = (sh: Shape) => {
    const template: ObjectTemplate = { type: sh.type, name: sh.name, width: sh.width, depth: sh.depth, color: sh.color, round: sh.round, catalogKey: `shape:${sh.id}` };
    return (
      <div className="shape-row" key={sh.id}>
        <PaletteItem store={store} title={`${sh.name} (${sh.width}×${sh.depth} studs, ${legoColorName(sh.color) ?? 'custom colour'})`} place={(at) => addObjectAt(store, template, at)}>
          <Swatch color={sh.color} ratio={sh.width / sh.depth} round={sh.round} />
          {sh.name}
        </PaletteItem>
        <button type="button" className="icon" aria-label={`Remove ${sh.name} from the palette`} onClick={() => store.getState().commit((p) => deleteShape(p, sh.id))}>
          ×
        </button>
      </div>
    );
  };

  return (
    <aside className="palette" aria-label="Add">
      <p className="muted small palette-hint">Tap to add, or drag onto the table.</p>
      <Section title="Modules" open>
        {(['32x32', '16x16', '16x8'] as const).map((k) => (
          <PaletteItem key={k} store={store} title={`Add a ${KIND_LABEL[k]} MILS module`} place={(at) => addModuleAt(store, k, undefined, at)}>
            <Swatch color={MILS_COLORS[k]} ratio={MILS_SIZES[k].width / MILS_SIZES[k].depth} />
            {KIND_LABEL[k]}
          </PaletteItem>
        ))}
        <PaletteItem store={store} title="Add an 8×16 MILS module (a 16×8 plate standing upright; gets an A-xx ID)" place={(at) => addModuleAt(store, '16x8', { width: 8, depth: 16 }, at)}>
          <Swatch color={MILS_COLORS['16x8']} ratio={0.5} />
          8×16
        </PaletteItem>
        <PaletteItem store={store} title="Add a 32×16 MILS module" place={(at) => addModuleAt(store, '32x16', undefined, at)}>
          <Swatch color={MILS_COLORS['32x16']} ratio={2} />
          32×16
        </PaletteItem>
        <button type="button" onClick={() => setDialog('module')} title="Add a module of any size">
          <Swatch color={MILS_COLORS.custom} />
          Custom…
        </button>
      </Section>

      <Section title="Features">
        <button type="button" onClick={() => setDialog('ride')} title="A ride, building or other feature built on its own base">
          <Swatch color="#c05046" />
          New…
        </button>
      </Section>

      <Section title="Designs">
        {designs.length === 0 && <span className="muted small">Select some things and choose “Save as design…” to reuse them here.</span>}
        {designs.map((d) => {
          const copies = copiesOf(project, d.id);
          const old = copies.filter((g) => isOutdated(project, g)).length;
          return (
            <div className="shape-row" key={d.id}>
              <PaletteItem store={store} title={`${d.name}: ${copies.length} cop${copies.length === 1 ? 'y' : 'ies'}${old ? `, ${old} not updated` : ''}`} place={(at) => placeDesignAt(store, d.id, at)}>
                <Swatch color="#6639ba" />
                {d.name}
                {old > 0 && <span className="badge" title={`${old} cop${old === 1 ? 'y has' : 'ies have'} not been updated to the latest design`}>{old}</span>}
              </PaletteItem>
              <button type="button" className="icon" aria-label={`Remove design ${d.name}`} title="Remove the design (placed copies stay)" onClick={() => store.getState().commit((p) => deleteDesign(p, d.id))}>
                ×
              </button>
            </div>
          );
        })}
      </Section>

      <Section title="Setup markers">
        {userMarkers.map(shapeEntry)}
        <button type="button" onClick={() => setDialog('marker')} title="Make a setup marker for this project and keep it in this list">
          + New marker…
        </button>
      </Section>

      <Section title="Small items">
        {userItems.map(shapeEntry)}
        <button type="button" onClick={() => setDialog('item')} title="A street light, bush, bench… any small thing, in a LEGO colour">
          + New item…
        </button>
      </Section>

      <Section title="Single pieces">
        <input
          type="search"
          className="part-search"
          placeholder="Search: tile 2x2, 3024…"
          aria-label="Search single pieces"
          value={partQuery}
          onChange={(e) => setPartQuery(e.target.value)}
        />
        {searchParts(partQuery).map((part) => (
          <PaletteItem
            key={part.key}
            store={store}
            title={`${part.name}${part.partNo ? ` (part ${part.partNo})` : ''}`}
            place={(at) =>
              addObjectAt(store, { type: 'piece', name: part.name, width: part.width, depth: part.depth, color: part.color, round: part.round, smooth: !part.studs, catalogKey: part.key }, at)
            }
          >
            <Swatch color={part.color} ratio={part.width / part.depth} round={part.round} />
            {part.name}
          </PaletteItem>
        ))}
        {partQuery && searchParts(partQuery).length === 0 && <span className="muted small">No match. Try “plate 1x6”.</span>}
        {userPieces.map(shapeEntry)}
        <button type="button" onClick={() => setDialog('piece')} title="A piece that isn't in the list yet: size in studs, smooth or studs, LEGO colour">
          + New piece…
        </button>
      </Section>

      {dialog === 'module' && (
        <SizeDialog
          title="Custom module"
          defaults={{ width: 48, depth: 48 }}
          onClose={() => setDialog(null)}
          onAdd={({ width, depth }) => {
            setDialog(null);
            const kind: MilsKind = milsKindForSize(width, depth);
            addModuleAt(store, kind, { width, depth });
          }}
        />
      )}
      {dialog === 'ride' && (
        <SizeDialog
          title="New feature"
          named
          defaults={{ width: 32, depth: 32 }}
          onClose={() => setDialog(null)}
          onAdd={({ name, width, depth }) => {
            setDialog(null);
            addModuleAt(store, milsKindForSize(width, depth), { width, depth }, undefined, { name: name || 'Ride', color: '#c05046' });
          }}
        />
      )}
      {(dialog === 'marker' || dialog === 'item' || dialog === 'piece') && (
        <NewThingDialog
          store={store}
          kind={dialog}
          onClose={() => setDialog(null)}
          onAdd={(template) => {
            setDialog(null);
            let shapeId = '';
            store.getState().commit((p) => {
              const r = addShape(p, { name: template.name, type: template.type, width: template.width, depth: template.depth, color: template.color, round: template.round, smooth: template.smooth });
              shapeId = r.id;
              return r.project;
            });
            addObjectAt(store, { ...template, catalogKey: `shape:${shapeId}` });
          }}
        />
      )}
    </aside>
  );
}

const THING = {
  marker: { type: 'setupMarker', title: 'New setup marker', placeholder: 'e.g. Popcorn cart', size: 2, color: 'White' },
  item: { type: 'item', title: 'New small item', placeholder: 'e.g. Street light, Bush', size: 1, color: 'Light Bluish Gray' },
  piece: { type: 'piece', title: 'New single piece', placeholder: 'e.g. Plate 1×6', size: 1, color: 'Light Bluish Gray' },
} as const;

/** New setup marker, small item or single piece: name, size, LEGO colour, layer. Kept in the palette. */
function NewThingDialog({ store, kind, onAdd, onClose }: { store: EditorStore; kind: keyof typeof THING; onAdd: (t: ObjectTemplate & { layerId: string }) => void; onClose: () => void }) {
  const t = THING[kind];
  const project = store.getState().project;
  const layers = [...project.layers].sort((a, b) => b.order - a.order);
  const [name, setName] = useState('');
  const [w, setW] = useState<number>(t.size);
  const [d, setD] = useState<number>(t.size);
  const [round, setRound] = useState(false);
  const [smooth, setSmooth] = useState(false);
  const [color, setColor] = useState(lego(t.color));
  const [layerId, setLayerId] = useState(kind === 'marker' ? defaultItemLayerId(project) : itemLayerId(store));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || w <= 0 || d <= 0) return;
    onAdd({ type: t.type, name: name.trim(), width: w, depth: d, color, round, smooth: kind === 'piece' && smooth, layerId });
  };
  return (
    <Modal title={t.title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.placeholder} maxLength={80} autoFocus required />
        </label>
        <div className="row">
          <label>
            Width (studs)
            <input type="number" min={1} max={2000} value={w} onChange={(e) => setW(Number(e.target.value))} required />
          </label>
          <label>
            Depth (studs)
            <input type="number" min={1} max={2000} value={d} onChange={(e) => setD(Number(e.target.value))} required />
          </label>
        </div>
        <label className="radio">
          <input type="checkbox" checked={round} onChange={(e) => setRound(e.target.checked)} />
          Round
        </label>
        {kind === 'piece' && (
          <label className="radio">
            <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
            Smooth top (tile — no studs)
          </label>
        )}
        <LegoColorPicker label="LEGO colour" value={color} onChange={(hex) => hex && setColor(hex)} />
        <label>
          Layer
          <select value={layerId} onChange={(e) => setLayerId(e.target.value)}>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">It’s added to the palette so you can place more, and one is placed now.</p>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Add</button>
        </footer>
      </form>
    </Modal>
  );
}

function SizeDialog({
  title,
  named,
  defaults,
  onAdd,
  onClose,
}: {
  title: string;
  named?: boolean;
  defaults: { width: number; depth: number };
  onAdd: (v: { name: string; width: number; depth: number }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [w, setW] = useState(defaults.width);
  const [d, setD] = useState(defaults.depth);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (w > 0 && d > 0) onAdd({ name: name.trim(), width: w, depth: d });
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {named && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ferris Wheel" maxLength={80} autoFocus />
          </label>
        )}
        <div className="row">
          <label>
            Width (studs)
            <input type="number" min={1} max={2000} value={w} onChange={(e) => setW(Number(e.target.value))} required autoFocus={!named} />
          </label>
          <label>
            Depth (studs)
            <input type="number" min={1} max={2000} value={d} onChange={(e) => setD(Number(e.target.value))} required />
          </label>
        </div>
        <p className="muted">
          {formatLength(w, 'in')} × {formatLength(d, 'in')}
        </p>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Add</button>
        </footer>
      </form>
    </Modal>
  );
}
