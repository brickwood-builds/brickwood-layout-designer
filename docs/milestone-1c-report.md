# Milestone 1C — Object editor: progress report

**Date:** 30 Oct 2026 · **Branch:** `milestone-1a` (builds on 1A and 1B)

## What was delivered

- **Palette sections** (left column). Modules are open; the other sections stay folded until you open them, so the default view stays basic:
  - **Modules**: 32×32, 16×16, 16×8, 32×16, Custom…
  - **Rides & buildings**: New… (name and size).
  - **Setup markers**: the 9 placeholder bricks from the setup notes (table/bench, flowers, tree, lamp, trash can, bush, bears, pine tree, flower pot), with their real brick sizes and colours. Round ones are drawn round.
  - **Bricks & plates**: a small starter catalog of bricks, plates and tiles, plus a round 2×2.
  - **My shapes**: any ride, building or item can be saved with "Save to My shapes" and reused; × removes it from the palette.
- **Adding**: tap/click adds near the middle of the view (rides and modules look for free space on the table). Dragging an entry onto the canvas, with the mouse or a finger, drops it exactly there, snapped.
- **Items on modules**:
  - markers and small items sit on top of modules and may cross module edges;
  - the properties panel shows "On modules C-05, C-06";
  - moving a module does **not** drag the items on it, because geometry doesn't imply ownership (handoff §3);
  - two small items in the same spot is a warning.
- **Object properties**: name, width/depth (keeps the centre), colour, position, notes, ride power; markers show which placeholder brick they stand for.
- **Groups**:
  - select several, then Group (Ctrl+G);
  - clicking any member picks up the whole group, which moves, rotates, copies and deletes as one, with a dashed outline;
  - Alt-click, or a chip in the group panel, picks a single piece;
  - the group can be renamed; Ungroup is Ctrl+Shift+G;
  - an item belongs to one group; a group left with one member dissolves; copying a whole group makes a "(copy)" group.
- **Marking warnings as intended**:
  - overlap and overhang warnings have an "Intended" button. The warning stops counting but stays recorded with its date, and "Show … marked as intended" lists them with Undo;
  - MILS ID problems (duplicate or retired) can't be marked as intended; they must be fixed.
- **Snapping**: stud, half-stud or off applies to every kind of object (half-stud and free placement are tested and survive export/import exactly).

Schema: three new optional fields (`shapes`, `acknowledgements`, object `catalogKey`/`round`), with defaults. Files exported from 1A/1B still open (tested).

Screenshot: `docs/screenshots/editor-objects-groups.png`.

## Test results

| Command | Result |
|---|---|
| lint / typecheck / build | OK |
| `npm test` | **71 / 71 passed** (5 files) |
| `npm run test:e2e` | **29 passed**, 17 skipped (mouse-only tests skip on iPad and touch-only tests skip on desktop) |

New browser tests:
- **Desktop:**
  - drag a Lamp from the palette onto C-05;
  - tap-add a plate, resize it, undo;
  - group two modules: click one picks up both, the arrow key moves both, Alt-click picks one, Ungroup;
  - mark an overhang as intended, then undo the mark;
  - new ride from the dialog lands in free space, is saved to My shapes and reused.
- **iPad:** finger-drag a Tree marker from the palette onto the table.

**Gate 1C** (place/edit objects across MILS boundaries without ID or geometry corruption): a marker dropped across C-01/C-02 sits on both. The modules are unchanged (same IDs, positions, labels) and no warnings appear. Moving modules leaves items exactly where they were, and decimal positions round-trip exactly.

## Bug found and fixed by the tests

- Alt-clicking a piece of a group that was already selected kept the whole group selected. It now picks the single piece.

## Not done in 1C (by design)

- **Nested groups and linked copies** are Phase 2.
- **Known connection points and irregular shapes** are Phase 2; everything is a rectangle or circle footprint for now.
- **The full parts catalog** (BrickLink/Brickwith) is Phase 3.
