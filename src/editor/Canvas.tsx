import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Ellipse, Group, Layer, Line, Rect, Shape, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { useStore } from 'zustand';
import { footprint, rectContains, snap, unionRect, type Rect as R } from '../domain/geometry';
import { allItems, isModule, moveItems, type Item } from '../domain/edits';
import { makeDragChecker } from './dragCheck';
import { drawOrder, itemAt } from '../domain/hit';
import { computeStack, heightColor, type StackInfo } from '../domain/heights';
import { SpatialIndex } from '../domain/spatial';
import { MILS_COLORS, isBase, moduleDisplayName, type Project } from '../domain/schema';
import { DEFAULT_PLATE_COLOR } from '../domain/legoColors';
import { partByKey } from '../domain/catalog';
import { hasZone, zoneRect } from '../domain/zones';
import { STUDS_PER_INCH, formatLength, type DisplayUnit } from '../domain/units';
import { dimensionLength } from '../domain/edits';
import { expandToGroups, withCarriedItems } from '../domain/objects';
import { finishCurve, finishStamp, finishStroke, fitToLevel, isEditable, itemLayerId, reshapePathTo, stairSpec } from './actions';
import { stairUnits, type StairUnit } from '../domain/stairs';
import { planStamps, spotsAlongPath, spotsInBox, type StampPlan, type StampSpot } from '../domain/stamps';
import { currentPoints, splinePoints } from '../domain/curves';
import type { EditorState } from './store';
import { cellsForBox, cellsForLine, cellsForPath, type Cell } from '../domain/brush';
import { isStamping, paintTemplate, stampSource, stampSpacing } from './drawTool';
import type { EditorStore } from './store';
import { gridStep, toScreen, toWorld, zoomAt, type View } from './view';

const ACCENT = '#1f6feb';
const WARN = '#d1242f';
const DRAG_THRESHOLD = { mouse: 3, touch: 8 };

type Gesture =
  | { type: 'pan'; startView: View; sx: number; sy: number; moved: boolean; clearOnTap: boolean }
  | { type: 'pinch'; startView: View; dist: number; mid: { x: number; y: number } }
  | { type: 'move'; ids: string[]; sx: number; sy: number; anchor: { x: number; y: number }; moved: boolean; touch: boolean }
  | { type: 'marquee'; sx: number; sy: number; x: number; y: number; additive: boolean }
  | { type: 'measure'; x1: number; y1: number }
  | { type: 'draw'; points: { x: number; y: number }[] }
  /** Draw › Curve: a tap/click adds a point; dragging pans instead. */
  | { type: 'curvePoint'; sx: number; sy: number; startView: View; panning: boolean }
  /** Dragging one of a curve's handles. */
  | { type: 'handle'; pathId: string; index: number; points: { x: number; y: number }[]; moved: boolean };

const HANDLE_PX = 14;

/** The curve or stairs whose handles are showing: being edited, still on this level, and selected. */
function editablePath(s: EditorState) {
  if (!s.editingPath || s.mode !== 'select') return null;
  const curve = s.project.curves.find((c) => c.id === s.editingPath);
  const stairs = curve ? undefined : s.project.stairs.find((c) => c.id === s.editingPath);
  const rec = curve ?? stairs;
  const group = rec && s.project.groups.find((g) => g.id === rec.groupId);
  if (!rec || !group || rec.levelId !== s.levelId || !group.memberIds.every((id) => s.selection.includes(id))) return null;
  const points = currentPoints(s.project, rec);
  return points ? { id: rec.id, curve, stairs, points } : null;
}

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
  const measure = useStore(store, (s) => s.measure);
  const heightLimit = useStore(store, (s) => (s.project.features.heights ? s.heightLimit : null));
  const curveDraft = useStore(store, (s) => s.curveDraft);
  const drawShape = useStore(store, (s) => s.draw.shape);
  const editing = useStore(store, editablePathKey);
  /** Draw › Curve: where the pointer is, to preview the next point. */
  const [curveHover, setCurveHover] = useState<{ x: number; y: number } | null>(null);
  /** A curve handle being dragged: the curve's points as they would be. */
  const [handleDrag, setHandleDrag] = useState<{ x: number; y: number }[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** Cells of the stroke being drawn (preview until the finger/mouse lifts). */
  const [stroke, setStroke] = useState<Cell[] | null>(null);
  /** Stamps of the stroke being drawn (pattern stamping), red where they won't fit. */
  const [stamps, setStamps] = useState<StampPlan[] | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [cursor, setCursor] = useState('default');
  const spaceDownRef = useRef(false);
  // Leaving Draw › Curve drops an unfinished curve.
  useEffect(() => {
    if (mode !== 'draw' || (drawShape !== 'curve' && drawShape !== 'stairs')) store.getState().set({ curveDraft: null });
  }, [mode, drawShape, store]);
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
  // Heights: things sitting at or above the chosen height are hidden, to see what's below.
  const heightHidden = useMemo(() => hiddenByHeight(project, level.id, heightLimit), [project, level.id, heightLimit]);
  const levelItems = useMemo(() => {
    return drawOrder(
      project,
      allItems(project).filter((i) => i.levelId === level.id && visibleLayers.has(i.layerId) && !heightHidden.has(i.id)),
    );
  }, [project, level.id, visibleLayers, heightHidden]);
  const selectedSet = useMemo(() => new Set(selection), [selection]);

  // While dragging, the moved items live on their own layer so the rest isn't redrawn.
  const draggedKey = drag ? drag.ids.join(',') : '';
  const draggedSet = useMemo(() => new Set(draggedKey ? draggedKey.split(',') : []), [draggedKey]);
  const baseItems = useMemo(() => (draggedSet.size ? levelItems.filter((i) => !draggedSet.has(i.id)) : levelItems), [levelItems, draggedSet]);
  const draggedItems = useMemo(() => levelItems.filter((i) => draggedSet.has(i.id)), [levelItems, draggedSet]);
  const checkDrag = useMemo(() => (draggedSet.size ? makeDragChecker(project, level.id, draggedSet) : null), [project, level.id, draggedSet]);
  const dragProblems = useMemo(() => (drag && checkDrag ? checkDrag(drag.dx, drag.dy) : new Set<string>()), [drag, checkDrag]);
  // Labels only re-render when zoom crosses one of these steps (not on every wheel tick).
  const labelZoom = Math.pow(2, Math.round(Math.log2(view.scale) * 4) / 4);
  const showLabels = project.settings.showLabels;
  // Plates with a feature built on them: their name moves to the top edge, out of the way.
  const builtOn = useMemo(() => {
    const solids = levelItems.filter((i) => isModule(i) || i.type === 'footprint');
    const index = new SpatialIndex(solids);
    const out = new Set<string>();
    for (const s of solids) {
      const r = footprint(s);
      for (const id of index.overlapping(r)) if (id !== s.id && rectContains(r, footprint(solids.find((x) => x.id === id)!))) out.add(s.id);
    }
    return out;
  }, [levelItems]);
  const shading = useMemo(() => {
    if (!project.features.heights || !project.settings.heightShading) return null;
    const stack = computeStack(project, level.id);
    const max = Math.max(0, ...[...stack.values()].map((i) => i.top));
    return { stack, max };
  }, [project, level.id]);
  const plateColors = project.settings.moduleColors === 'plate';
  // Studs appear once they are big enough to aim at.
  const studsVisible = view.scale >= STUD_MIN_PX;

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
      const s = store.getState();
      const w = toWorld(s.view, p.x, p.y);
      return itemAt(s.project, s.levelId, w.x, w.y, hiddenByHeight(s.project, s.levelId, s.project.features.heights ? s.heightLimit : null));
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
        setStroke(null);
        setStamps(null);
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        gesture.current = { type: 'pinch', startView: s.view, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        return;
      }
      if (pointers.current.size > 2) return;
      const touch = e.pointerType === 'touch';
      const ec = e.button === 0 && !spaceDownRef.current ? editablePath(s) : null;
      if (ec) {
        let best = -1;
        let bestD = (touch ? HANDLE_PX * 1.6 : HANDLE_PX);
        ec.points.forEach((q, i) => {
          const sp = toScreen(s.view, q.x, q.y);
          const d = Math.hypot(sp.x - p.x, sp.y - p.y);
          if (d <= bestD) {
            best = i;
            bestD = d;
          }
        });
        if (best >= 0) {
          gesture.current = { type: 'handle', pathId: ec.id, index: best, points: ec.points.map((q) => ({ ...q })), moved: false };
          return;
        }
      }
      if (s.mode === 'draw' && (s.draw.shape === 'curve' || s.draw.shape === 'stairs') && e.button === 0 && !spaceDownRef.current) {
        gesture.current = { type: 'curvePoint', sx: p.x, sy: p.y, startView: s.view, panning: false };
        return;
      }
      if (s.mode === 'draw' && e.button === 0 && !spaceDownRef.current) {
        const w = toWorld(s.view, p.x, p.y);
        gesture.current = { type: 'draw', points: [w] };
        if (isStamping(s.draw)) setStamps(strokeStamps(store, [w]));
        else setStroke(strokeCells(store, [w]));
        return;
      }
      if (s.mode === 'measure' && e.button === 0 && !spaceDownRef.current) {
        const w = toWorld(s.view, p.x, p.y);
        const mode = s.project.settings.snap;
        const x1 = snap(w.x, mode);
        const y1 = snap(w.y, mode);
        gesture.current = { type: 'measure', x1, y1 };
        s.set({ measure: { x1, y1, x2: x1, y2: y1 } });
        return;
      }
      if (e.button === 1 || spaceDownRef.current || s.mode === 'pan') {
        gesture.current = { type: 'pan', startView: s.view, sx: p.x, sy: p.y, moved: false, clearOnTap: false };
        return;
      }
      const hit = hitTest(p);
      if (hit) {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        // A grouped item brings its whole group, unless Alt picks the single piece.
        const unit = e.altKey ? [hit.id] : expandToGroups(s.project, [hit.id]);
        let sel = s.selection;
        if (additive) sel = sel.includes(hit.id) ? sel.filter((id) => !unit.includes(id)) : [...sel, ...unit];
        else if (e.altKey || !sel.includes(hit.id)) sel = unit;
        s.select(sel);
        if (sel.includes(hit.id)) {
          // Markers sitting on a moved module come along.
          gesture.current = { type: 'move', ids: withCarriedItems(s.project, sel), sx: p.x, sy: p.y, anchor: { x: hit.x, y: hit.y }, moved: false, touch };
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
      if (!g && s.mode === 'draw' && (s.draw.shape === 'curve' || s.draw.shape === 'stairs') && s.curveDraft?.length) setCurveHover(toWorld(s.view, p.x, p.y));
      if (!g) {
        if (e.pointerType === 'mouse') setCursor(spaceDownRef.current || s.mode === 'pan' ? 'grab' : s.mode === 'measure' || s.mode === 'draw' ? 'crosshair' : hitTest(p) ? 'move' : 'default');
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
      } else if (g.type === 'curvePoint') {
        if (!g.panning && Math.hypot(p.x - g.sx, p.y - g.sy) > (e.pointerType === 'touch' ? DRAG_THRESHOLD.touch : DRAG_THRESHOLD.mouse * 2)) g.panning = true;
        if (g.panning) s.setView({ ...g.startView, x: g.startView.x + p.x - g.sx, y: g.startView.y + p.y - g.sy });
      } else if (g.type === 'handle') {
        const w = toWorld(s.view, p.x, p.y);
        // Stairs straighten onto whole studs anyway; curves may be finer.
        const mode = s.project.stairs.some((x) => x.id === g.pathId) ? 'full' : s.project.settings.snap === 'free' ? 'free' : 'half';
        g.points[g.index] = { x: snap(w.x, mode), y: snap(w.y, mode) };
        g.moved = true;
        setHandleDrag([...g.points]);
      } else if (g.type === 'draw') {
        g.points.push(toWorld(s.view, p.x, p.y));
        if (isStamping(s.draw)) setStamps(strokeStamps(store, g.points));
        else setStroke(strokeCells(store, g.points));
      } else if (g.type === 'measure') {
        const w = toWorld(s.view, p.x, p.y);
        const mode = s.project.settings.snap;
        let x2 = snap(w.x, mode);
        let y2 = snap(w.y, mode);
        // Shift keeps the line straight across or down.
        if (e.shiftKey) {
          if (Math.abs(x2 - g.x1) > Math.abs(y2 - g.y1)) y2 = g.y1;
          else x2 = g.x1;
        }
        s.set({ measure: { x1: g.x1, y1: g.y1, x2, y2 } });
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
      if (g.type === 'curvePoint') {
        if (!cancelled && !g.panning) {
          const w = toWorld(s.view, g.sx, g.sy);
          s.set({ curveDraft: [...(s.curveDraft ?? []), w] });
          setCurveHover(w);
        }
        return;
      }
      if (g.type === 'handle') {
        setHandleDrag(null);
        if (!cancelled && g.moved) reshapePathTo(store, g.pathId, g.points);
        return;
      }
      if (g.type === 'draw') {
        setStroke(null);
        setStamps(null);
        if (cancelled) return;
        if (isStamping(s.draw)) finishStamp(store, strokeSpots(store, g.points));
        else finishStroke(store, strokeCells(store, g.points));
        return;
      }
      if (g.type === 'measure') {
        if (cancelled) s.set({ measure: null });
        return;
      }
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
        const hits = expandToGroups(s.project, new SpatialIndex(candidates).intersecting({ x: a.x, y: a.y, width: b.x - a.x, depth: b.y - a.y }));
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
    const onLeave = () => {
      store.getState().set({ pointer: null });
      setCurveHover(null);
    };
    const onDbl = () => {
      const s = store.getState();
      if (s.mode === 'draw' && (s.draw.shape === 'curve' || s.draw.shape === 'stairs')) finishCurve(store);
    };
    const onUpEvt = (e: PointerEvent) => onUp(e);
    const onCancel = (e: PointerEvent) => onUp(e, true);

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUpEvt);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDbl);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUpEvt);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDbl);
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
          <Layer listening={false}>
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
                  return <Rect key={t.id} x={r.x} y={r.y} width={r.width} height={r.depth} fill="#d9b27c" stroke="#a67c45" strokeWidth={1.5} strokeScaleEnabled={false} cornerRadius={1} listening={false} />;
                })}
              <Grid view={view} viewport={viewport} />
              <Items items={baseItems} dx={0} dy={0} selected={selectedSet} problems={EMPTY} editable={editable} plateColors={plateColors} />
              {studsVisible && <Studs items={baseItems} view={view} viewport={viewport} />}
              {shading && <HeightShading items={baseItems} stack={shading.stack} max={shading.max} />}
              {showLabels && <Labels items={baseItems} dx={0} dy={0} zoom={labelZoom} builtOn={builtOn} />}
            </Group>
          </Layer>
          <Layer listening={false}>
            <Group x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
              {drag && (
                <>
                  <Items items={draggedItems} dx={drag.dx} dy={drag.dy} selected={selectedSet} problems={dragProblems} editable={editable} plateColors={plateColors} />
                  {showLabels && <Labels items={draggedItems} dx={drag.dx} dy={drag.dy} zoom={labelZoom} builtOn={builtOn} />}
                </>
              )}
              {levelItems.filter(hasZone).map((i) => {
                const off = drag && draggedSet.has(i.id) ? drag : null;
                const z = zoneRect(i, off?.dx ?? 0, off?.dy ?? 0);
                return <Rect key={`zone-${i.id}`} x={z.x} y={z.y} width={z.width} height={z.depth} stroke="#d97706" strokeWidth={1.5} strokeScaleEnabled={false} dash={[8 / view.scale, 5 / view.scale]} fill="rgba(217,119,6,0.06)" listening={false} />;
              })}
              {project.groups
                .filter((g) => g.memberIds.length > 0 && g.memberIds.every((id) => selectedSet.has(id)))
                .map((g) => {
                  const members = levelItems.filter((i) => g.memberIds.includes(i.id));
                  const b = unionRect(members.map((i) => footprint(drag && draggedSet.has(i.id) ? { ...i, x: i.x + drag.dx, y: i.y + drag.dy } : i)));
                  if (!b) return null;
                  const pad = 6 / view.scale;
                  return <Rect key={g.id} x={b.x - pad} y={b.y - pad} width={b.width + pad * 2} height={b.depth + pad * 2} stroke={ACCENT} strokeWidth={1.5} strokeScaleEnabled={false} dash={[6 / view.scale, 4 / view.scale]} listening={false} />;
                })}
            </Group>
            <Group x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} listening={false}>
              {project.dimensions
                .filter((d) => d.levelId === level.id)
                .map((d) => (
                  <DimensionLine key={d.id} d={d} scale={view.scale} unit={project.settings.displayUnit} />
                ))}
              {measure && <DimensionLine d={measure} scale={view.scale} unit={project.settings.displayUnit} live />}
              {stroke && <StrokePreview cells={stroke} store={store} />}
              {stamps && <StampsPreview plan={stamps} store={store} />}
              {curveDraft && curveDraft.length > 0 && <CurveDraftPreview store={store} points={curveHover ? [...curveDraft, curveHover] : curveDraft} ctrl={curveDraft} scale={view.scale} />}
              {editing && <CurveHandles store={store} points={handleDrag ?? editing.points} scale={view.scale} dragging={!!handleDrag} />}
            </Group>
            <Rulers view={view} viewport={viewport} unit={project.settings.displayUnit} />
            {marquee && <Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(31,111,235,0.1)" stroke={ACCENT} strokeWidth={1} dash={[4, 3]} listening={false} />}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

const EMPTY: ReadonlySet<string> = new Set();

const STUD_MIN_PX = 7;

interface ItemsProps {
  items: Item[];
  dx: number;
  dy: number;
  selected: ReadonlySet<string>;
  problems: ReadonlySet<string>;
  editable: ReadonlySet<string>;
  /** "Finished look": modules in their real plate colour. */
  plateColors: boolean;
}

/** All shapes of one layer. Memoised per item, so a selection change redraws only what changed. */
const Items = memo(function Items({ items, dx, dy, selected, problems, editable, plateColors }: ItemsProps) {
  return (
    <>
      {items.map((item) => (
        <ItemShape
          key={item.id}
          item={item}
          dx={dx}
          dy={dy}
          selected={selected.has(item.id)}
          problem={problems.has(item.id)}
          locked={!editable.has(item.layerId)}
          plateColors={plateColors}
        />
      ))}
    </>
  );
});

const ItemShape = memo(function ItemShape({
  item,
  dx,
  dy,
  selected,
  problem,
  locked,
  plateColors,
}: {
  item: Item;
  dx: number;
  dy: number;
  selected: boolean;
  problem: boolean;
  locked: boolean;
  plateColors: boolean;
}) {
  const r = footprint({ ...item, x: item.x + dx, y: item.y + dy });
  const module = isModule(item);
  const fill = module ? moduleFill(item, plateColors) : item.color;
  const stroke = problem ? WARN : selected ? ACCENT : 'rgba(0,0,0,0.45)';
  // Stroke widths are in screen pixels, so zooming doesn't need a re-render.
  const common = {
    id: item.id,
    fill,
    stroke,
    strokeWidth: problem || selected ? 3 : 1,
    strokeScaleEnabled: false,
    perfectDrawEnabled: false,
    listening: !locked,
  };
  return !module && item.round ? (
    <Ellipse {...common} x={r.x + r.width / 2} y={r.y + r.depth / 2} radiusX={r.width / 2} radiusY={r.depth / 2} />
  ) : (
    <Rect {...common} x={r.x} y={r.y} width={r.width} height={r.depth} opacity={!module && item.type === 'footprint' ? 0.85 : 1} />
  );
});

/** Module IDs and ride names. Hidden when too small to read (adaptive detail); small items unlabelled. */
const Labels = memo(function Labels({ items, dx, dy, zoom, builtOn }: { items: Item[]; dx: number; dy: number; zoom: number; builtOn: ReadonlySet<string> }) {
  return (
    <>
      {items.map((item) => {
        const module = isModule(item);
        if (!module && item.type !== 'footprint') return null;
        const text = module ? moduleDisplayName(item) : item.name;
        const full = footprint({ ...item, x: item.x + dx, y: item.y + dy });
        // Something built on it: label in a band along the top edge instead of the middle.
        const r = builtOn.has(item.id) ? { ...full, y: full.y + 0.5, depth: Math.min(full.depth / 4, 6) } : full;
        const fontSize = fitText(text, r.width, r.depth, module ? 5 : 6);
        if (!text || fontSize * zoom < 7) return null;
        return (
          <Text
            key={item.id}
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
            perfectDrawEnabled={false}
          />
        );
      })}
    </>
  );
});

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
const Grid = memo(function Grid({ view, viewport }: { view: View; viewport: { width: number; height: number } }) {
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
});

/** A measured line with its length, drawn at constant screen size. */
function DimensionLine({ d, scale, unit, live }: { d: { x1: number; y1: number; x2: number; y2: number; label?: string }; scale: number; unit: DisplayUnit; live?: boolean }) {
  const len = dimensionLength(d);
  const text = `${d.label ? `${d.label}: ` : ''}${formatLength(len, unit)}${unit === 'studs' ? '' : ` (${+len.toFixed(1)} studs)`}`;
  const color = live ? '#d1242f' : '#6639ba';
  const mx = (d.x1 + d.x2) / 2;
  const my = (d.y1 + d.y2) / 2;
  const fontPx = 13;
  return (
    <>
      <Line points={[d.x1, d.y1, d.x2, d.y2]} stroke={color} strokeWidth={2} strokeScaleEnabled={false} dash={live ? undefined : [6 / scale, 4 / scale]} />
      {[
        [d.x1, d.y1],
        [d.x2, d.y2],
      ].map(([x, y], i) => (
        <Rect key={i} x={x! - 3 / scale} y={y! - 3 / scale} width={6 / scale} height={6 / scale} fill={color} />
      ))}
      {len > 0 && (
        <Group x={mx} y={my} scaleX={1 / scale} scaleY={1 / scale}>
          <Rect x={-text.length * 3.6 - 6} y={-fontPx - 6} width={text.length * 7.2 + 12} height={fontPx + 8} fill="rgba(255,255,255,0.92)" cornerRadius={4} />
          <Text x={-text.length * 3.6 - 6} y={-fontPx - 6} width={text.length * 7.2 + 12} height={fontPx + 8} text={text} fontSize={fontPx} fill={color} align="center" verticalAlign="middle" fontFamily="system-ui, sans-serif" />
        </Group>
      )}
    </>
  );
}

const RULER = 20; // px
const STUDS_PER: Record<DisplayUnit, number> = { studs: 1, in: STUDS_PER_INCH, cm: 1.25 };

/** Top and left rulers in the chosen unit, measured from the level's origin (table corner). */
const Rulers = memo(function Rulers({ view, viewport, unit }: { view: View; viewport: { width: number; height: number }; unit: DisplayUnit }) {
  const unitPx = STUDS_PER[unit] * view.scale;
  const steps = unit === 'in' ? [1, 2, 6, 12, 24, 48, 120] : unit === 'cm' ? [1, 2, 5, 10, 20, 50, 100, 200] : [1, 2, 4, 8, 16, 32, 64, 128, 256];
  const step = steps.find((s) => s * unitPx >= 50) ?? steps[steps.length - 1]!;
  const minor = steps.slice().reverse().find((s) => s < step && s * unitPx >= 8);
  const ticks = (length: number, offset: number) => {
    const out: { pos: number; major: boolean; label: string }[] = [];
    const tickStep = minor ?? step;
    const first = Math.ceil(-offset / unitPx / tickStep) * tickStep;
    for (let v = first; v * unitPx + offset <= length; v += tickStep) {
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-9;
      out.push({ pos: v * unitPx + offset, major, label: major ? String(+v.toFixed(2)) : '' });
    }
    return out;
  };
  const top = ticks(viewport.width, view.x);
  const left = ticks(viewport.height, view.y);
  return (
    <Group listening={false}>
      <Rect x={0} y={0} width={viewport.width} height={RULER} fill="rgba(246,246,244,0.92)" />
      <Rect x={0} y={0} width={RULER} height={viewport.height} fill="rgba(246,246,244,0.92)" />
      {top.map((t, i) => (
        <Group key={`t${i}`}>
          <Line points={[t.pos, RULER, t.pos, t.major ? 6 : 13]} stroke="#555" strokeWidth={1} />
          {t.label && <Text x={t.pos + 3} y={2} text={t.label} fontSize={10} fill="#444" />}
        </Group>
      ))}
      {left.map((t, i) => (
        <Group key={`l${i}`}>
          <Line points={[RULER, t.pos, t.major ? 6 : 13, t.pos]} stroke="#555" strokeWidth={1} />
          {t.label && <Text x={2} y={t.pos + 3} text={t.label} fontSize={10} fill="#444" rotation={0} />}
        </Group>
      ))}
      <Rect x={0} y={0} width={RULER} height={RULER} fill="#e8e8e4" />
      <Text x={2} y={5} width={RULER - 2} text={unit === 'studs' ? 'st' : unit} fontSize={9} fill="#666" align="center" />
    </Group>
  );
});

/** Studs on plates (and on bricks/plates placed as items), only for what's on screen. */
const Studs = memo(function Studs({ items, view, viewport }: { items: Item[]; view: View; viewport: { width: number; height: number } }) {
  const a = toWorld(view, 0, 0);
  const b = toWorld(view, viewport.width, viewport.height);
  const visible = items.filter((i) => {
    if (!hasStuds(i)) return false;
    const r = footprint(i);
    return r.x < b.x && r.x + r.width > a.x && r.y < b.y && r.y + r.depth > a.y;
  });
  // One pattern fill per plate (not one circle per stud) keeps big layouts fast.
  const px = Math.min(64, Math.max(8, Math.round(view.scale)));
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const c = ctx._context;
        const pattern = c.createPattern(studTile(px), 'repeat');
        if (!pattern) return;
        for (const i of visible) {
          const r = footprint(i);
          pattern.setTransform(new DOMMatrix().translate(r.x, r.y).scale(1 / px));
          c.fillStyle = pattern;
          c.fillRect(r.x, r.y, r.width, r.depth);
        }
      }}
    />
  );
});

const studTiles = new Map<number, HTMLCanvasElement>();

/** One stud, drawn at `px` pixels per stud: a LEGO stud is 4.8 mm across on an 8 mm pitch. */
function studTile(px: number): HTMLCanvasElement {
  let tile = studTiles.get(px);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = tile.height = px;
    const g = tile.getContext('2d')!;
    g.beginPath();
    g.arc(px / 2, px / 2, px * 0.3, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fill();
    g.lineWidth = Math.max(1, px / 24);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.stroke();
    studTiles.set(px, tile);
  }
  return tile;
}

/** Plates (features too: they're built on a MILS plate), single pieces (not tiles) and marker bricks show studs; small items don't. */
function hasStuds(i: Item): boolean {
  if (isModule(i)) return true;
  if (i.smooth) return false;
  const part = partByKey(i.catalogKey);
  if (part) return part.studs;
  return i.type === 'setupMarker' || i.type === 'piece';
}

function moduleFill(m: Extract<Item, { kind: unknown }>, plateColors: boolean): string {
  if (plateColors && m.plateColor) return m.plateColor;
  if (plateColors && !isBase(m)) return DEFAULT_PLATE_COLOR;
  return m.color ?? MILS_COLORS[m.kind];
}

/** IDs that sit at or above the height filter (none when the filter is off). */
function hiddenByHeight(project: Project, levelId: string, limit: number | null): ReadonlySet<string> {
  if (limit === null) return EMPTY;
  const hidden = new Set<string>();
  for (const [id, info] of computeStack(project, levelId)) if (info.base >= limit && info.height > 0) hidden.add(id);
  return hidden;
}

/** Cells for the current stroke, following the Draw tool's shape and brush. */
function strokeCells(store: EditorStore, points: { x: number; y: number }[]): Cell[] {
  const { project, draw } = store.getState();
  const t = paintTemplate(project, draw);
  const b = { cellW: t.width, cellD: t.depth, width: draw.width };
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (draw.shape === 'box') return cellsForBox(first, last, b);
  if (draw.shape === 'line') return cellsForLine(first, last, b);
  return cellsForPath(points, b);
}

/** Where stamps go for the current stroke: along it, or in a grid for a box. */
function strokeSpots(store: EditorStore, points: { x: number; y: number }[]): StampSpot[] {
  const { project, draw } = store.getState();
  const sp = stampSpacing(project, draw);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (draw.shape === 'box') return spotsInBox(first, last, sp);
  if (draw.shape === 'line') return spotsAlongPath([first, last], sp);
  if (draw.shape === 'curve') return spotsAlongPath(points.length > 1 ? splinePoints(points) : points, sp);
  return spotsAlongPath(points, sp);
}

function strokeStamps(store: EditorStore, points: { x: number; y: number }[]): StampPlan[] {
  const s = store.getState();
  return planStamps(s.project, s.levelId, itemLayerId(store), stampSource(s.project, s.draw), strokeSpots(store, points), s.draw.turn, s.draw.whenTaken);
}

/** Selector for the path being edited; stable while nothing about it changes. */
let lastEditing: { key: string; value: ReturnType<typeof editablePath> } = { key: '', value: null };
function editablePathKey(s: EditorState) {
  const ec = editablePath(s);
  const key = ec ? `${ec.id}:${ec.points.map((q) => `${q.x},${q.y}`).join(';')}` : '';
  if (key !== lastEditing.key) lastEditing = { key, value: ec };
  return lastEditing.value;
}

function curveCells(points: { x: number; y: number }[], width: number, t: { width: number; depth: number }): Cell[] {
  return points.length < 2 ? [] : cellsForPath(splinePoints(points), { cellW: t.width, cellD: t.depth, width });
}

const flat = (pts: { x: number; y: number }[]) => pts.flatMap((q) => [q.x, q.y]);

/** Draw › Curve in progress: the pieces it will lay, the curve line, and the points so far. */
function CurveDraftPreview({ store, points, ctrl, scale }: { store: EditorStore; points: { x: number; y: number }[]; ctrl: { x: number; y: number }[]; scale: number }) {
  const { project, draw } = store.getState();
  if (draw.shape === 'stairs') {
    const units = points.length > 1 ? stairUnits(points, stairSpec(store, points)) : [];
    return (
      <>
        <StairsPreview units={units} color={draw.color} scale={scale} />
        {ctrl.map((q, i) => (
          <Circle key={i} x={q.x} y={q.y} radius={4 / scale} fill={ACCENT} listening={false} />
        ))}
      </>
    );
  }
  const t = paintTemplate(project, draw);
  const stamping = isStamping(draw);
  const cells = stamping ? [] : curveCells(points, draw.width, t);
  return (
    <>
      {cells.length > 0 && <StrokePreview cells={cells} store={store} />}
      {stamping && points.length > 1 && <StampsPreview plan={strokeStamps(store, points)} store={store} />}
      {points.length > 1 && <Line points={flat(splinePoints(points))} stroke={ACCENT} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />}
      {ctrl.map((q, i) => (
        <Circle key={i} x={q.x} y={q.y} radius={4 / scale} fill={ACCENT} listening={false} />
      ))}
    </>
  );
}

/** Edit curve: the curve line and a round handle on each of its points. */
function CurveHandles({ store, points, scale, dragging }: { store: EditorStore; points: { x: number; y: number }[]; scale: number; dragging: boolean }) {
  const s = store.getState();
  const curve = s.project.curves.find((c) => c.id === s.editingPath);
  const stairs = s.project.stairs.find((c) => c.id === s.editingPath);
  const cells = dragging && curve && !curve.spacing ? curveCells(points, curve.width, curve.template) : [];
  return (
    <>
      {cells.length > 0 && <CellsPreview cells={cells} color={curve!.template.color} round={!!curve!.template.round} w={curve!.template.width} d={curve!.template.depth} />}
      {dragging && stairs && <StairsPreview units={stairUnits(points, stairs)} color={stairs.color} scale={scale} />}
      <Line points={flat(stairs ? points : splinePoints(points))} stroke={ACCENT} strokeWidth={1.5} strokeScaleEnabled={false} dash={[6 / scale, 4 / scale]} listening={false} />
      {points.map((q, i) => (
        <Circle key={i} x={q.x} y={q.y} radius={7 / scale} fill="#fff" stroke={ACCENT} strokeWidth={2} strokeScaleEnabled={false} listening={false} />
      ))}
    </>
  );
}

function CellsPreview({ cells, color, round, w, d }: { cells: Cell[]; color: string; round: boolean; w: number; d: number }) {
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const c = ctx._context;
        c.globalAlpha = 0.75;
        c.fillStyle = color;
        c.beginPath();
        for (const cell of cells) {
          if (round) {
            c.moveTo(cell.x + w, cell.y + d / 2);
            c.ellipse(cell.x + w / 2, cell.y + d / 2, w / 2, d / 2, 0, 0, Math.PI * 2);
          } else c.rect(cell.x, cell.y, w, d);
        }
        c.fill();
        c.globalAlpha = 1;
      }}
    />
  );
}

/** Stamps about to be placed; red where something is already there (they're skipped). */
function StampsPreview({ plan, store }: { plan: StampPlan[]; store: EditorStore }) {
  const { project, draw } = store.getState();
  const src = stampSource(project, draw);
  const color = src.kind === 'piece' ? src.template.color : ACCENT;
  const round = src.kind === 'piece' && !!src.template.round;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const c = ctx._context;
        for (const ok of [true, false]) {
          c.globalAlpha = ok ? 0.75 : 0.45;
          c.fillStyle = ok ? color : WARN;
          c.beginPath();
          for (const { rect: r } of plan.filter((x) => x.ok === ok)) {
            if (round && ok) {
              c.moveTo(r.x + r.width, r.y + r.depth / 2);
              c.ellipse(r.x + r.width / 2, r.y + r.depth / 2, r.width / 2, r.depth / 2, 0, 0, Math.PI * 2);
            } else c.rect(r.x, r.y, r.width, r.depth);
          }
          c.fill();
        }
        c.globalAlpha = 1;
      }}
    />
  );
}

/** Stairs about to be laid: each step, with how high its top is (plates). */
function StairsPreview({ units, color, scale }: { units: StairUnit[]; color: string; scale: number }) {
  return (
    <>
      <Shape
        listening={false}
        sceneFunc={(ctx) => {
          const c = ctx._context;
          c.globalAlpha = 0.8;
          c.fillStyle = color;
          c.strokeStyle = 'rgba(0,0,0,0.6)';
          c.lineWidth = 1 / scale;
          for (const u of units) {
            c.fillRect(u.rect.x, u.rect.y, u.rect.width, u.rect.depth);
            c.strokeRect(u.rect.x, u.rect.y, u.rect.width, u.rect.depth);
          }
          c.globalAlpha = 1;
        }}
      />
      {scale * 2 > 9 &&
        units.map((u, i) => {
          const size = Math.min(u.rect.width, u.rect.depth) * 0.5;
          return <Text key={i} x={u.rect.x} y={u.rect.y + u.rect.depth / 2 - size / 2} width={u.rect.width} align="center" text={String(u.top)} fontSize={size} fill="#111" listening={false} />;
        })}
    </>
  );
}

/** What the stroke will paint (or, red, what it will erase). */
function StrokePreview({ cells, store }: { cells: Cell[]; store: EditorStore }) {
  const { project, draw } = store.getState();
  const t = paintTemplate(project, draw);
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const c = ctx._context;
        c.globalAlpha = draw.erase ? 0.35 : 0.75;
        c.fillStyle = draw.erase ? '#d1242f' : t.color;
        c.beginPath();
        for (const cell of cells) {
          if (t.round && !draw.erase) {
            c.moveTo(cell.x + t.width, cell.y + t.depth / 2);
            c.ellipse(cell.x + t.width / 2, cell.y + t.depth / 2, t.width / 2, t.depth / 2, 0, 0, Math.PI * 2);
          } else c.rect(cell.x, cell.y, t.width, t.depth);
        }
        c.fill();
        c.globalAlpha = 1;
      }}
    />
  );
}

/** Heights: tint everything by how high its top is (a relief map, read from above). */
const HeightShading = memo(function HeightShading({ items, stack, max }: { items: Item[]; stack: Map<string, StackInfo>; max: number }) {
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const c = ctx._context;
        c.globalAlpha = 0.6;
        for (const i of items) {
          const info = stack.get(i.id);
          if (!info || info.top <= 0) continue;
          c.fillStyle = heightColor(info.top, max);
          const r = footprint(i);
          if (!isModule(i) && i.round) {
            c.beginPath();
            c.ellipse(r.x + r.width / 2, r.y + r.depth / 2, r.width / 2, r.depth / 2, 0, 0, Math.PI * 2);
            c.fill();
          } else c.fillRect(r.x, r.y, r.width, r.depth);
        }
        c.globalAlpha = 1;
      }}
    />
  );
});

