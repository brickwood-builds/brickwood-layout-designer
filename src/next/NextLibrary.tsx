// Trial interface: the library. One search box, a handful of kinds, picture tiles. Pick a tile
// (it stays picked) and click on the table where each one goes; or drag a tile onto the table.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { EditorStore } from '../editor/store';
import { PaletteItem } from '../editor/Palette';
import { addModuleAt, addObjectAt, placeDesignAt, type ObjectTemplate } from '../editor/actions';
import { addShape } from '../domain/objects';
import { designSize } from '../domain/designs';
import { MILS_COLORS, MILS_SIZES, milsKindForSize, type Shape } from '../domain/schema';
import { searchParts, STARTER_PARTS, COMMON_PART_KEYS } from '../domain/catalog';
import { libraryIfLoaded, libraryTemplate, loadLibrary, searchLibrary, shownPartNo, type LibraryPart, type PartsLibrary } from '../domain/partsLibrary';
import { lego } from '../domain/legoColors';
import { LegoColorPicker } from '../ui/LegoColorPicker';
import { Icon } from './icons';

type Kind = 'plates' | 'buildings' | 'items' | 'pieces' | 'designs';
const KINDS: [Kind, string][] = [
  ['plates', 'Plates'],
  ['buildings', 'Buildings'],
  ['items', 'Items'],
  ['pieces', 'Pieces'],
  ['designs', 'Designs'],
];

/** A little picture of the thing: its shape, in its colour. */
function Pic({ w, d, color, round, outline }: { w: number; d: number; color: string; round?: boolean; outline?: { x: number; y: number }[] }) {
  const m = Math.max(w, d);
  const pad = m * 0.08;
  const box = `${-pad} ${-pad} ${m + pad * 2} ${m + pad * 2}`;
  const ox = (m - w) / 2;
  const oy = (m - d) / 2;
  return (
    <svg className="nx-pic" viewBox={box} aria-hidden="true">
      {outline ? (
        <polygon points={outline.map((q) => `${q.x + ox},${q.y + oy}`).join(' ')} fill={color} stroke="rgba(0,0,0,.35)" strokeWidth={m * 0.02} />
      ) : round ? (
        <ellipse cx={m / 2} cy={m / 2} rx={w / 2} ry={d / 2} fill={color} stroke="rgba(0,0,0,.35)" strokeWidth={m * 0.02} />
      ) : (
        <rect x={ox} y={oy} width={w} height={d} rx={m * 0.03} fill={color} stroke="rgba(0,0,0,.35)" strokeWidth={m * 0.02} />
      )}
    </svg>
  );
}

function Tile({ store, hold, place, title, sub, pic }: { store: EditorStore; hold: { key: string; label: string; preview?: { width: number; depth: number; color: string; round?: boolean } }; place: (at?: { x: number; y: number }) => void; title: string; sub?: string; pic: ReactNode }) {
  return (
    <div className="nx-tile">
      <PaletteItem store={store} hold={hold} place={place} title={title}>
        {pic}
        <span className="nx-tile-name">{title}</span>
        {sub && <span className="nx-tile-sub">{sub}</span>}
      </PaletteItem>
    </div>
  );
}

export function NextLibrary({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('plates');
  const [query, setQuery] = useState('');
  const [making, setMaking] = useState<'building' | 'item' | null>(null);
  const project = useStore(store, (s) => s.project);
  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  // Searching looks through everything; the kinds narrow it when not searching.
  const show = (k: Kind) => !!q || kind === k;

  const drawShape = (as: 'feature' | 'item') => {
    const s = store.getState();
    s.set({ mode: 'draw', measure: null, curveDraft: null, holding: null, draw: { ...s.draw, erase: false, shape: 'outline', feature: { ...s.draw.feature, name: '', kind: as } } });
  };

  const plates = (
    [
      ['32x32', '32×32', undefined],
      ['16x16', '16×16', undefined],
      ['16x8', '16×8', undefined],
      ['16x8', '8×16', { width: 8, depth: 16 }],
      ['32x16', '32×16', undefined],
    ] as const
  ).filter(([, label]) => match(`plate module ${label}`));
  const shapes = project.shapes.filter((sh) => (sh.type === 'item' || sh.type === 'setupMarker' || sh.type === 'footprint') && match(sh.name));
  const designs = project.designs.filter((d) => match(d.name));

  const shapeTile = (sh: Shape) => {
    const template: ObjectTemplate = { type: sh.type, name: sh.name, width: sh.width, depth: sh.depth, color: sh.color, round: sh.round, ...(sh.showName ? { showName: true } : {}), ...(sh.outline ? { outline: sh.outline } : {}), catalogKey: `shape:${sh.id}` };
    return (
      <Tile
        key={sh.id}
        store={store}
        hold={{ key: `shape:${sh.id}`, label: sh.name, preview: { width: sh.width, depth: sh.depth, color: sh.color, round: sh.round } }}
        place={(at) => addObjectAt(store, template, at)}
        title={sh.name}
        sub={`${sh.width}×${sh.depth}`}
        pic={<Pic w={sh.width} d={sh.depth} color={sh.color} round={sh.round} outline={sh.outline} />}
      />
    );
  };

  return (
    <aside className="nx-library" aria-label="Add">
      <div className="nx-lib-head">
        <div className="nx-search">
          <Icon name="search" />
          <input type="search" aria-label="Search everything" placeholder="Search: 16x16, bench, tile 2x2, 3024…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="button" className="nx-icon-btn" onClick={onClose} aria-label="Close the library" title="Close">
          <Icon name="close" />
        </button>
      </div>
      {!q && (
        <div className="nx-chips" role="tablist" aria-label="Kinds">
          {KINDS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`nx-chip ${kind === k ? 'nx-on' : ''}`} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="nx-muted nx-lib-tip">Pick one, then click (or tap) on the table for each — or drag it there.</p>
      <div className="nx-lib-scroll">
        {show('plates') && plates.length > 0 && (
          <Section title="Plates (MILS)">
            {plates.map(([k, label, size]) => (
              <Tile
                key={label}
                store={store}
                hold={{ key: `module:${label}`, label: `${label} plate`, preview: { ...(size ?? MILS_SIZES[k]), color: MILS_COLORS[k] } }}
                place={(at) => addModuleAt(store, k, size, at)}
                title={label}
                sub="plate"
                pic={<Pic w={(size ?? MILS_SIZES[k]).width} d={(size ?? MILS_SIZES[k]).depth} color={MILS_COLORS[k]} />}
              />
            ))}
          </Section>
        )}
        {show('buildings') && (
          <Section title="Buildings and rides">
            {!q && <ActionTile icon="plus" title="New building…" sub="a box, any size" onClick={() => setMaking('building')} />}
            {!q && <ActionTile icon="shape" title="Draw a shape…" sub="click its corners" onClick={() => drawShape('feature')} />}
            {q && <span className="nx-muted">Buildings are made new each time (no list to search).</span>}
          </Section>
        )}
        {show('items') && (
          <Section title="Items and markers">
            {shapes.map(shapeTile)}
            {!q && <ActionTile icon="plus" title="New item…" sub="bench, lamp, tree…" onClick={() => setMaking('item')} />}
            {!q && <ActionTile icon="shape" title="Draw a shape…" sub="click its corners" onClick={() => drawShape('item')} />}
          </Section>
        )}
        {show('pieces') && <Pieces store={store} query={q} />}
        {show('designs') && (designs.length > 0 || !q) && (
          <Section title="Designs">
            {designs.map((d) => (
              <Tile
                key={d.id}
                store={store}
                hold={{ key: `design:${d.id}`, label: d.name, preview: { ...designSize(d), color: '#6639ba' } }}
                place={(at) => placeDesignAt(store, d.id, at)}
                title={d.name}
                sub={`${d.modules.length + d.objects.length} things`}
                pic={<Pic w={Math.max(1, designSize(d).width)} d={Math.max(1, designSize(d).depth)} color="#6639ba" />}
              />
            ))}
            {!q && designs.length === 0 && <span className="nx-muted">Select some things, then Group and “Save as design” in Details, to reuse them here.</span>}
          </Section>
        )}
      </div>
      {making && <MakeDialog store={store} what={making} onClose={() => setMaking(null)} />}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="nx-lib-section">
      <h3>{title}</h3>
      <div className="nx-tiles">{children}</div>
    </section>
  );
}

function ActionTile({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <div className="nx-tile">
      <button type="button" className="nx-tile-action" onClick={onClick}>
        <span className="nx-pic nx-pic-action">
          <Icon name={icon} size={22} />
        </span>
        <span className="nx-tile-name">{title}</span>
        <span className="nx-tile-sub">{sub}</span>
      </button>
    </div>
  );
}

/** LEGO pieces: the common ones, or a search of the whole parts list. */
function Pieces({ store, query }: { store: EditorStore; query: string }) {
  const [lib, setLib] = useState<PartsLibrary | null>(libraryIfLoaded());
  useEffect(() => {
    if (lib || !query) return;
    let live = true;
    void loadLibrary().then((l) => live && setLib(l));
    return () => {
      live = false;
    };
  }, [lib, query]);
  const starters = query ? searchParts(query) : STARTER_PARTS.filter((p) => COMMON_PART_KEYS.includes(p.key));
  const more = query && lib ? searchLibrary(lib, query, 24).parts.filter((p) => !starters.some((s) => s.rbNo === p.partNo)) : [];
  const libTile = (p: LibraryPart) => {
    const t = libraryTemplate(p);
    return (
      <Tile
        key={p.key}
        store={store}
        hold={{ key: p.key, label: p.name, preview: { width: t.width, depth: t.depth, color: t.color, round: t.round } }}
        place={(at) => addObjectAt(store, t, at)}
        title={p.name}
        sub={shownPartNo(p)}
        pic={<Pic w={t.width} d={t.depth} color={t.color} round={t.round} />}
      />
    );
  };
  if (!starters.length && !more.length) return query ? null : null;
  return (
    <Section title="LEGO pieces">
      {starters.map((part) => (
        <Tile
          key={part.key}
          store={store}
          hold={{ key: `part:${part.key}`, label: part.name, preview: { width: part.width, depth: part.depth, color: part.color, round: part.round } }}
          place={(at) => addObjectAt(store, { type: 'piece', name: part.name, width: part.width, depth: part.depth, color: part.color, round: part.round, smooth: !part.studs, catalogKey: part.key }, at)}
          title={part.name}
          sub={part.partNo}
          pic={<Pic w={part.width} d={part.depth} color={part.color} round={part.round} />}
        />
      ))}
      {more.map(libTile)}
      {!query && <span className="nx-muted">Search for any other part by name, size or number.</span>}
    </Section>
  );
}

/** A new building (a named base) or a new small item: name, size, colour. */
function MakeDialog({ store, what, onClose }: { store: EditorStore; what: 'building' | 'item'; onClose: () => void }) {
  const [name, setName] = useState('');
  const [w, setW] = useState(what === 'building' ? 32 : 2);
  const [d, setD] = useState(what === 'building' ? 32 : 2);
  const [color, setColor] = useState(lego('Light Bluish Gray'));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !(w > 0) || !(d > 0)) return;
    if (what === 'building') addModuleAt(store, milsKindForSize(w, d), { width: w, depth: d }, undefined, { name: name.trim(), color: '#c05046' });
    else {
      let shapeId = '';
      store.getState().commit((p) => {
        const r = addShape(p, { name: name.trim(), type: 'item', width: w, depth: d, color });
        shapeId = r.id;
        return r.project;
      });
      addObjectAt(store, { type: 'item', name: name.trim(), width: w, depth: d, color, catalogKey: `shape:${shapeId}` });
    }
    onClose();
  };
  return (
    <div className="nx-scrim" onClick={onClose}>
      <form className="nx-sheet" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={what === 'building' ? 'New building' : 'New item'}>
        <h2>{what === 'building' ? 'New building or ride' : 'New item'}</h2>
        <label className="nx-field">
          <span>Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={what === 'building' ? 'e.g. Ferris wheel' : 'e.g. Bench'} />
        </label>
        <div className="nx-row">
          <label className="nx-field">
            <span>Width (studs)</span>
            <input type="number" min={1} value={w} onChange={(e) => setW(Number(e.target.value))} />
          </label>
          <label className="nx-field">
            <span>Depth (studs)</span>
            <input type="number" min={1} value={d} onChange={(e) => setD(Number(e.target.value))} />
          </label>
        </div>
        {what === 'item' && <LegoColorPicker label="Colour" value={color} onChange={(hex) => hex && setColor(hex)} />}
        <div className="nx-row nx-end">
          <button type="button" className="nx-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="nx-btn nx-primary" disabled={!name.trim()}>
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
