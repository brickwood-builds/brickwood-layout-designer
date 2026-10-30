import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Rect, Shape, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { useStore } from 'zustand';
import { footprint, snap, type Rect as R } from '../domain/geometry';
import { allItems, isModule, moveItems, type Item } from '../domain/edits';
import { SpatialIndex } from '../domain/spatial';
import { MILS_COLORS, moduleDisplayName, type Project } from '../domain/schema';
import { checkLayout } from '../domain/validation';
import { fitToLevel, isEditable } from './actions';
import type { EditorStore } from './store';
import { gridStep, toScreen, toWorld, zoomAt, type View } from './view';

const ACCENT = '#1f6feb';
const WARN = '#d1242f';
const DRAG_THRESHOLD = { mouse: 3, touch: 8 };

type Gesture =
  | { type: 'pan'; startView: View; sx: number; sy: number; moved: boolean; clearOnTap: boolean }
  | { type: 'pinch'; startView: View; dist: number; mid: { x: number; y: number } }
  | { type: 'move'; ids: string[]; sx: number; sy: number; anchor: { x: number; y: number }; moved: boolean; touch: boolean }
  | { type: 'marquee'; sx: number; sy: number; x: number; y: number; additive: boolean };

/** Font size (studs) that keeps a one-line label inside its rectangle. */
function fitText(text: string, width: number, depth: number, max: number) {
  return Math.min(max, depth * 0.45, (width * 0.9) / Math.max(1, text.length * 0.6));
}

export function Canvas({ store }: { store: EditorStore }) {
  const project = useStore(store, (s) => s.project);
  const levelId = useStore(store, (s) => s.levelId);
  const view = useStore(store, (s) => s.view);
  const selection = useStore(store, (s) => s.selection);
  const drag = useStore(store, (s) => s.drag);
  const mode = useStore(store, (s) => s.mode);
  const showOtherLevels = useStore(store, (s) => s.showOtherLevels);
  const viewport = useStore(store, (s) => s.viewport);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [cursor, setCursor] = useState('default');
  const spaceDownRef = useRef(false);
  useEffect(() => {
    spaceDownRef.current = spaceDown;
  }, [spaceDown]);

  // Track the canvas size; fit the active level the first time we know it.
  useEffect(() => {
    const el = containerRef.current!;
    let fitted = false;
    const ro = new ResizeObserver(() => {
      store.getState().set({ viewport: { width: el.clientWidth, height: el.clientHeight } });
      if (!fitted && el.clientWidth > 0) {
        fitted = true;
        fitToLevel(store);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [store]);

  // Space held = temporary pan (mouse).
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest('input, textarea, select, dialog');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const level = project.levels.find((l) => l.id === levelId) ?? project.levels[0]!;
  const editable = useMemo(() => new Set(project.layers.filter((l) => l.visible && !l.locked).map((l) => l.id)), [project.layers]);
  const visibleLayers = useMemo(() => new Set(project.layers.filter((l) => l.visible).map((l) => l.id)), [project.layers]);
  const levelItems = useMemo(() => {
    const items = allItems(project).filter((i) => i.levelId === level.id && visibleLayers.has(i.layerId));
    // Draw whatever is being dragged on top.
    if (!drag) return items;
    const dragged = new Set(drag.ids);
    return [...items.filter((i) => !dragged.has(i.id)), ...items.filter((i) => dragged.has(i.id))];
  }, [project, level.id, visibleLayers, drag]);
  const selectedSet = useMemo(() => new Set(selection), [selection]);

  // Live warnings for the dragged selection: overlaps with others and overhang.
  const dragProblems = useMemo(() => {
    if (!drag) return new Set<string>();
    const moved = moveItems(project, drag.ids, drag.dx, drag.dy);
    const ids = new Set(drag.ids);
    const problems = new Set<string>();
    for (const w of checkLayout(moved)) {
      if (w.levelId !== level.id || (w.kind !== 'overlap' && w.kind !== 'overhang')) continue;
      for (const id of w.ids) if (ids.has(id)) problems.add(id);
    }
    return problems;
  }, [drag, project, level.id]);

  // Gesture handling on the container with Pointer Events (mouse, pen and touch alike).
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const el = containerRef.current!;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hitTest = (p: { x: number; y: number }): Item | null => {
      const shape = stageRef.current?.getIntersection(p);
      const id = shape?.id();
      if (!id) return null;
      const s = store.getState();
      const item = allItems(s.project).find((i) => i.id === id);
      return item && item.levelId === s.levelId && isEditable(store, item.layerId) ? item : null;
    };
    const endDrag = (commit: boolean) => {
      const s = store.getState();
      const d = s.drag;
      s.set({ drag: null });
      if (commit && d && (d.dx !== 0 || d.dy !== 0)) s.commit((p) => moveItems(p, d.ids, d.dx, d.dy));
    };

    const onDown = (e: PointerEvent) => {
      if (e.button === 2) return;
      el.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.current.set(e.pointerId, p);
      const s = store.getState();
      if (pointers.current.size === 2) {
        // Second finger: switch whatever was happening into a pinch.
        endDrag(false);
        setMarquee(null);
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        gesture.current = { type: 'pinch', startView: s.view, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        return;
      }
      if (pointers.current.size > 2) return;
      const touch = e.pointerType === 'touch';
      if (e.button === 1 || spaceDownRef.current || s.mode === 'pan') {
        gesture.current = { type: 'pan', startView: s.view, sx: p.x, sy: p.y, moved: false, clearOnTap: false };
        return;
      }
      const hit = hitTest(p);
      if (hit) {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        let sel = s.selection;
        if (additive) sel = sel.includes(hit.id) ? sel.filter((id) => id !== hit.id) : [...sel, hit.id];
        else if (!sel.includes(hit.id)) sel = [hit.id];
        s.select(sel);
        if (sel.includes(hit.id)) {
          gesture.current = { type: 'move', ids: sel, sx: p.x, sy: p.y, anchor: { x: hit.x, y: hit.y }, moved: false, touch };
        }
        return;
      }
      if (touch) {
        gesture.current = { type: 'pan', startView: s.view, sx: p.x, sy: p.y, moved: false, clearOnTap: true };
      } else {
        gesture.current = { type: 'marquee', sx: p.x, sy: p.y, x: p.x, y: p.y, additive: e.shiftKey || e.metaKey || e.ctrlKey };
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = local(e);
      const s = store.getState();
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
      if (e.pointerType === 'mouse') {
        const w = toWorld(s.view, p.x, p.y);
        s.set({ pointer: w });
      }
      const g = gesture.current;
      if (!g) {
        if (e.pointerType === 'mouse') setCursor(spaceDownRef.current || s.mode === 'pan' ? 'grab' : hitTest(p) ? 'move' : 'default');
        return;
      }
      if (g.type === 'pinch') {
        const pts = [...pointers.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const zoomed = zoomAt(g.startView, g.mid.x, g.mid.y, dist / g.dist);
        s.setView({ ...zoomed, x: zoomed.x + mid.x - g.mid.x, y: zoomed.y + mid.y - g.mid.y });
      } else if (g.type === 'pan') {
        if (Math.hypot(p.x - g.sx, p.y - g.sy) > DRAG_THRESHOLD.touch) g.moved = true;
        s.setView({ ...g.startView, x: g.startView.x + p.x - g.sx, y: g.startView.y + p.y - g.sy });
        setCursor('grabbing');
      } else if (g.type === 'move') {
        if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) < (g.touch ? DRAG_THRESHOLD.touch : DRAG_THRESHOLD.mouse)) return;
        g.moved = true;
        const mode = s.project.settings.snap;
        // Snap the grabbed item's corner, and move everything selected by the same amount.
        const dx = snap(g.anchor.x + (p.x - g.sx) / s.view.scale, mode) - g.anchor.x;
        const dy = snap(g.anchor.y + (p.y - g.sy) / s.view.scale, mode) - g.anchor.y;
        if (!s.drag || s.drag.dx !== dx || s.drag.dy !== dy) s.set({ drag: { ids: g.ids, dx, dy } });
      } else if (g.type === 'marquee') {
        g.x = p.x;
        g.y = p.y;
        setMarquee({ x: Math.min(g.sx, p.x), y: Math.min(g.sy, p.y), w: Math.abs(p.x - g.sx), h: Math.abs(p.y - g.sy) });
      }
    };

    const onUp = (e: PointerEvent, cancelled = false) => {
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      const s = store.getState();
      if (!g) return;
      if (g.type === 'pinch') {
        if (pointers.current.size === 0) gesture.current = null;
        return;
      }
      gesture.current = null;
      if (g.type === 'move') endDrag(!cancelled && g.moved);
      else if (g.type === 'pan') {
        if (g.clearOnTap && !g.moved && !cancelled) s.select([]);
        setCursor('default');
      } else if (g.type === 'marquee') {
        setMarquee(null);
        if (cancelled) return;
        if (Math.abs(g.x - g.sx) < 4 && Math.abs(g.y - g.sy) < 4) {
          if (!g.additive) s.select([]);
          return;
        }
        const a = toWorld(s.view, Math.min(g.sx, g.x), Math.min(g.sy, g.y));
        const b = toWorld(s.view, Math.max(g.sx, g.x), Math.max(g.sy, g.y));
        const candidates = allItems(s.project).filter((i) => i.levelId === s.levelId && isEditable(store, i.layerId));
        const hits = new SpatialIndex(candidates).intersecting({ x: a.x, y: a.y, width: b.x - a.x, depth: b.y - a.y });
        s.select(g.additive ? [...s.selection, ...hits] : hits);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const s = store.getState();
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      s.setView(zoomAt(s.view, p.x, p.y, factor));
    };
    const onLeave = () => store.getState().set({ pointer: null });
    const onUpEvt = (e: PointerEvent) => onUp(e);
    const onCancel = (e: PointerEvent) => onUp(e, true);

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUpEvt);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUpEvt);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
    };
  }, [store]);

  // Test/automation hook: map studs on the active level to page coordinates.
  useEffect(() => {
    (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor = {
      toPage: (x: number, y: number) => {
        const r = containerRef.current!.getBoundingClientRect();
        const p = toScreen(store.getState().view, x, y);
        return { x: p.x + r.left, y: p.y + r.top };
      },
      state: () => store.getState(),
    };
  }, [store]);

  const pxToStuds = (px: number) => px / view.scale;
  const otherLevels = showOtherLevels ? project.levels.filter((l) => l.id !== level.id && l.visible) : [];
  const effectiveCursor = mode === 'pan' || spaceDown ? (cursor === 'grabbing' ? 'grabbing' : 'grab') : cursor;

  return (
    <div
      ref={containerRef}
      className="canvas"
      style={{ cursor: effectiveCursor }}
      data-testid="canvas"
      onContextMenu={(e) => e.preventDefault()}
    >
      {viewport.width > 0 && (
        <Stage ref={stageRef} width={viewport.width} height={viewport.height}>
          <Layer>
            <Group x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
              {otherLevels.map((l) => (
                <Group key={l.id} x={l.offsetX - level.offsetX} y={l.offsetY - level.offsetY} opacity={0.3} listening={false}>
                  <LevelContent project={project} levelId={l.id} visibleLayers={visibleLayers} />
                </Group>
              ))}
              {project.tables
                .filter((t) => t.levelId === level.id)
                .map((t) => {
                  const r = footprint(t);
                  return <Rect key={t.id} x={r.x} y={r.y} width={r.width} height={r.depth} fill="#d9b27c" stroke="#a67c45" strokeWidth={pxToStuds(1.5)} cornerRadius={1} listening={false} />;
                })}
              <Grid view={view} viewport={viewport} />
              {levelItems.map((item) => {
                const off = drag && drag.ids.includes(item.id) ? drag : null;
                return (
                  <ItemShape
                    key={item.id}
                    item={item}
                    x={item.x + (off?.dx ?? 0)}
                    y={item.y + (off?.dy ?? 0)}
                    selected={selectedSet.has(item.id)}
                    problem={dragProblems.has(item.id)}
                    locked={!editable.has(item.layerId)}
                    scale={view.scale}
                  />
                );
              })}
            </Group>
            {marquee && <Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(31,111,235,0.1)" stroke={ACCENT} strokeWidth={1} dash={[4, 3]} listening={false} />}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

function ItemShape({ item, x, y, selected, problem, locked, scale }: { item: Item; x: number; y: number; selected: boolean; problem: boolean; locked: boolean; scale: number }) {
  const r = footprint({ ...item, x, y });
  const module = isModule(item);
  const text = module ? moduleDisplayName(item) : item.name;
  const fill = module ? (item.color ?? MILS_COLORS[item.kind]) : item.color;
  const fontSize = fitText(text, r.width, r.depth, module ? 5 : 6);
  const showText = fontSize * scale >= 7; // adaptive detail: hide unreadable labels
  const stroke = problem ? WARN : selected ? ACCENT : 'rgba(0,0,0,0.45)';
  const strokePx = problem || selected ? 3 : 1;
  return (
    <Group>
      <Rect
        id={item.id}
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.depth}
        fill={fill}
        opacity={module ? 1 : item.type === 'footprint' ? 0.85 : 1}
        stroke={stroke}
        strokeWidth={strokePx / scale}
        listening={!locked}
      />
      {showText && text && (
        <Text
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.depth}
          text={text}
          fontSize={fontSize}
          fontFamily="system-ui, sans-serif"
          fontStyle={module ? 'normal' : 'bold'}
          fill={module ? '#1b1b1b' : '#ffffff'}
          align="center"
          verticalAlign="middle"
          wrap="none"
          listening={false}
        />
      )}
    </Group>
  );
}

/** Static drawing of another level for the combined overview. */
function LevelContent({ project, levelId, visibleLayers }: { project: Project; levelId: string; visibleLayers: Set<string> }) {
  return (
    <>
      {project.tables
        .filter((t) => t.levelId === levelId)
        .map((t) => {
          const r = footprint(t);
          return <Rect key={t.id} x={r.x} y={r.y} width={r.width} height={r.depth} stroke="#7a5a2f" strokeWidth={0.5} dash={[2, 2]} />;
        })}
      {allItems(project)
        .filter((i) => i.levelId === levelId && visibleLayers.has(i.layerId))
        .map((i) => {
          const r: R = footprint(i);
          return <Rect key={i.id} x={r.x} y={r.y} width={r.width} height={r.depth} fill={isModule(i) ? (i.color ?? MILS_COLORS[i.kind]) : i.color} />;
        })}
    </>
  );
}

/** Stud grid over the visible area, with stronger lines every 32 studs (one 32×32 MILS). */
function Grid({ view, viewport }: { view: View; viewport: { width: number; height: number } }) {
  const step = gridStep(view.scale);
  const a = toWorld(view, 0, 0);
  const b = toWorld(view, viewport.width, viewport.height);
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const x0 = Math.floor(a.x / step) * step;
        const y0 = Math.floor(a.y / step) * step;
        const line = (major: boolean) => {
          ctx.lineWidth = (major ? 1 : 0.5) / view.scale;
          ctx.strokeStyle = major ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)';
        };
        for (const major of [false, true]) {
          ctx.beginPath();
          line(major);
          for (let x = x0; x <= b.x; x += step) {
            if ((x % 32 === 0) !== major) continue;
            ctx.moveTo(x, a.y);
            ctx.lineTo(x, b.y);
          }
          for (let y = y0; y <= b.y; y += step) {
            if ((y % 32 === 0) !== major) continue;
            ctx.moveTo(a.x, y);
            ctx.lineTo(b.x, y);
          }
          ctx.stroke();
        }
      }}
    />
  );
}
