# Milestone 1B — MILS editor: progress report

**Date:** 30 Oct 2026 · **Branch:** `milestone-1a` (1B builds on 1A)

## What was delivered

Opening a project now opens the editor (it replaces the read-only view from 1A).

- **Canvas** (Konva): the table, MILS modules and ride/building footprints drawn to scale on a stud grid. Stronger grid lines every 32 studs, and the grid spacing adapts to the zoom. Labels hide when too small to read.
- **Navigation:**
  - Fit (F);
  - zoom at the pointer with the mouse wheel or a trackpad pinch;
  - − / + buttons and keys;
  - pan with Pan mode (H), Space-drag or the middle mouse button;
  - on iPad: one-finger drag on empty space pans and two-finger pinch zooms.
- **Selecting:**
  - click or tap selects; Shift/Ctrl-click adds or removes;
  - with a mouse, dragging a box on empty space selects everything it touches;
  - clicking or tapping empty space clears the selection; Ctrl+A selects all on the level.
- **Moving:**
  - drag (mouse or finger) moves the whole selection as one block, snapped to whole studs (half-stud and off are in the Snap menu);
  - a red outline while dragging warns about overlaps or overhang; the move is still allowed.
  - arrow keys nudge 1 stud, Shift+arrow 10.
- **Editing:**
  - add 32×32, 16×16, 16×8, 32×16 or a custom size from the left palette. The module goes to the nearest free spot on the table, already selected;
  - rotate 90° (R / Shift+R or buttons); several modules rotate together as one block;
  - Duplicate (Ctrl+D), Copy/Paste (Ctrl+C/V), Delete (Del).
- **Properties panel:**
  - MILS ID, name, size, custom width/depth, X/Y in studs (with inches/cm), notes, ride power;
  - on iPad portrait it floats over the canvas and only appears when something is selected.
- **MILS IDs:**
  - new modules get the next free ID in the project's own style (B-61 for Adventure Park, B21-V for the Kingdom);
  - duplicate or retired IDs are refused with a message;
  - blank IDs are allowed (buildings built on their plate).
- **Plates not in the layout** (new): IDs of plates that exist but aren't placed are kept, so new modules never take them.
  - The Adventure Park starter records the 17 v5 plates that aren't in the 12 ft layout (B-50 to B-56, B-59, B-60, A-23, A-24, A-27, A-28, C-14 to C-17).
  - Deleting a labelled module adds its ID to this list.
- **Undo/redo** (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, toolbar ↶ ↷): one step per drag, rotate, property change or batch delete, up to 200 steps.
- **Autosave** shortly after each change, and immediately when the iPad hides the page. The toolbar shows Saved / Saving… / Not saved.
  - If the same project was saved from another tab, nothing is overwritten. You get "Save mine as a copy" or "Reload latest".
- **Warnings** (status bar): modules or rides that overlap, items overhanging the level's table, duplicate or retired IDs. Clicking a warning selects and centres the items.
- **Levels:**
  - "Table…" edits the table name and size (inches);
  - "+ Level" adds a shelf/level with its own table, height above floor and overview offset;
  - a level picker and an "Others" overview show the other levels faintly for alignment;
  - an empty level can be deleted.
- **Units:** inches / cm / studs for display; studs stay canonical.

Screenshots: `docs/screenshots/editor-park.png`, `editor-kingdom-ipad.png` and `editor-park-ipad-portrait.png`.

## Test results (clean `npm ci`, 30 Oct 2026)

| Command | Result |
|---|---|
| `npm run lint` / `npm run typecheck` | OK |
| `npm test` | **58 / 58 passed** (4 files) |
| `npm run build` | OK |
| `npm run test:e2e` | **23 passed**, 11 skipped (mouse tests run on desktop only, touch tests on the iPad project only) |

New browser tests (real pointer input on the real canvas):
- **Desktop (mouse):**
  - drag a module onto the empty end of the table; it snaps to (480, 40), saves and survives a reload;
  - snapping stays on whole studs when zoomed in and at Fit;
  - ID validation (duplicate and retired refused) and undo;
  - keyboard nudge, rotate, delete, undo and redo;
  - adding from the palette gives B-61, not a stored plate ID;
  - marquee select, then delete and undo as one step;
  - the overlap warning appears, can be clicked to select the items, and clears on undo;
  - Pan mode moves the view and not the modules; wheel zoom; Fit restores;
  - adding a shelf level, placing a module on it, the overview of both, and surviving a reload.
- **iPad (touch, via Chrome DevTools touch events):**
  - tap to select, finger-drag to move with snapping, autosaved;
  - one-finger pan doesn't clear the selection; tap on empty space clears it; two-finger pinch zooms.

New unit tests cover:
- ID generation (prefixes, village style, retired and stored IDs) and validation;
- the R-tree spatial index;
- move, rotate (four turns return to the start, blocks stay joined), add with free-spot search, duplicate/paste labelling, delete with group cleanup, resize keeping the centre;
- level add/edit/delete rules and per-level overhang;
- view math (zoom at a point, fit, grid step);
- undo/redo keeping the stored revision;
- autosave picking up edits made during a save, and stopping with a conflict instead of overwriting.

## Gate (handoff 1B)

| Gate | Status |
|---|---|
| Accurately lay out real MILS modules | ✅ both starters edit with no warnings; positions are exact studs |
| Positions survive save/reopen | ✅ autosave plus reload (unit and browser) |
| Interactions pass browser tests | ✅ mouse and touch suites above |

## Notes and known gaps

- **Undo/redo was brought forward from 1D.** All edits are pure functions on the project, so whole-document undo was simple and safe.
- **Ride footprints can also be selected, moved and edited.** The full object catalog (setup markers, small items), collision acknowledgement and groups are Milestone 1C.
- **Rides don't sit on modules** in either drawing: each ride has its own space. The overlap warning therefore covers rides as well as modules.
- **Tables** are edited from "Table…", not dragged, so the table can't be moved by accident.
- **Real Safari is still untested** (WebKit isn't available here). Touch behaviour was verified with Chromium touch events at iPad size.
