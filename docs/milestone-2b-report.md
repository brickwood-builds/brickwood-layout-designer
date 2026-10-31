# Milestone 2B — Drawing tools: progress report

**Date:** 31 Oct 2026 · Phase 2. The owner's first use case: walkways made of 1×1 round plates.

## What was delivered

- **Draw mode** (toolbar **Draw**, or **B**). The panel sets:
  - **Draw with:** any single piece (new: **Plate Round 1×1**, Tan), or this project's own pieces, small items and markers;
  - **Colour:** real LEGO colours;
  - **Brush width:** 1, 2, 3, 4, 6 or 8 studs;
  - **Shape:** Freehand, Straight (start to finish), or Fill box;
  - **Erase instead:** removes things on the drawing layer under the brush.
- **One piece per stud** (or per piece-sized spot for bigger pieces, aligned to their grid). Fast strokes are filled in, so there are no gaps.
- **Painting over existing pieces doesn't double them up** (collision policy: skip).
- **One Undo per stroke** (FR-03.05), whatever its size.
- **The live preview** shows the stroke before you let go; red means erasing.
- **Draws on the layer chosen in Layers → New items** (Surface details suits walkways). Walkway plates on a module move with it, like everything else.
- **iPad:** one finger draws and two fingers still pan and zoom.
- **Printout:** single pieces are counted, not listed one by one, e.g. "Plate Round 1×1 · Tan · 412".
- **Help:** a new "Drawing walkways and rows" topic.

Screenshot: `docs/screenshots/draw-walkway.png`, a curving walkway 2 studs wide across two modules (237 plates).

## Tests

- Unit: 6 new tests:
  - a fast stroke leaves no gaps;
  - brush width;
  - box fill and the 2×2 grid;
  - painting with no doubling;
  - the eraser only affects its layer;
  - piece counting.
- Browser: 3 new tests:
  - freehand walkway on Surface details with gaps filled, removed by one Undo;
  - fill box, then erase part of it, then the printout counts 40;
  - finger-drawing on the iPad.
- Totals: **114 unit, 53 browser**, all passing.

## Not yet (Phase 2 continues)

- **Editable controlled curves** (draw, then bend the curve), and **pattern stamping**.
- **Collision policies other than "skip"** (replace / overlap / stop).
- **Terrain and stairs, clearance zones for moving rides, nested groups and reusable designs.**
