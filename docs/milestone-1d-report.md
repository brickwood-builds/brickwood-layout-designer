# Milestone 1D — Refinement: progress report

**Date:** 30 Oct 2026 · **Branch:** `milestone-1a` (builds on 1A–1C)

With 1D, Phase 1 is complete except 1E (cloud sync), which the handoff marks "later" and which needs owner decisions (below).

## What was delivered

- **Performance on a large display.** Test fixture: 14 ft of 42 in deep tables packed with 264 MILS modules and 1,584 setup markers. The editor now:
  - draws the dragged items on their own layer, so the other 1,800 shapes aren't redrawn while dragging;
  - memoizes every shape and label;
  - keeps stroke widths constant on screen (zooming doesn't re-render);
  - checks warnings during a drag only for the moved items, against an index built once (unit-tested to match the full check);
  - pauses Konva's hit-detection canvas while zooming or panning and rebuilds it before the next click.

  Measured in headless Chromium (software rendering, the slowest case):

  | | open | drag (per step) | zoom (per step) |
  |---|---|---|---|
  | before | 396 ms | 62 ms | 71 ms |
  | after, large display | 516 ms | 40 ms | 78 ms |
  | after, tiny display (66 modules) | 198 ms | 41 ms | 34 ms |

  Dragging on the large display now costs the same as on a tiny one; the ~40 ms is test-harness round-trip time. Zooming costs about 40 ms more per step on the large display in software rendering; real Chrome and Safari draw with the GPU. Domain operations on the large fixture: layout check 11 ms, move 0.3 ms, rotate 1 ms, schema validation 24 ms.
- **Layers** (toolbar → Layers): show/hide and lock each layer, rename, add, delete when empty, "Move here" for the selection. Locked or hidden items can't be selected, and are dropped from the selection when locked.
- **Rulers** along the top and left of the canvas in the chosen unit, measured from the back-left corner of the table. Tick spacing adapts to zoom.
- **Measure tool** (M): drag between two points (Shift for straight); ends snap like modules. The panel shows the length, plus the across/down split, in the chosen unit and studs. "Keep this dimension" (with optional label) saves it; saved dimensions show on the canvas and the printout and can be deleted (FR-01.05).
- **Print / export** (toolbar → Print…):
  - the overhead plan with IDs, ride names and dimensions;
  - tables of modules (ID, name, size, position from the back-left corner), rides left to right with power, markers with the module they sit on, and dimensions;
  - "Print / Save PDF" (landscape print styles), "Download picture (PNG)" and "Download drawing (SVG)" (stays sharp at any size, opens in a browser, Inkscape or Visio);
  - the dashboard thumbnails now use the same drawing code.
- **Built-in help** ("?" button, ? or F1 key):
  - 15 searchable topics bundled with the app, so they work offline: getting started, editing, iPad gestures, keyboard shortcuts, MILS IDs, items and markers, groups, warnings, tables and levels, layers, measuring, printing, backups and recovery, scale and units, troubleshooting;
  - it opens on the topic for the current screen (dashboard, editor, measure mode, print page) (FR-14.01/14.04, TR-32/33);
  - a unit test checks every screen's topic exists and that the shortcuts topic lists the keys the editor handles (TR-34).
- **Works offline.** The build writes a service worker listing every built file. After the app has been opened once on a device (the show iPad, say), it opens, edits and saves with no internet. A browser test opens the app, goes offline, reloads, opens a project and opens help.
- **Toolbar kept basic:** "Add a level…" moved inside Table… so everything fits on one line at desktop width.
- Undo/redo and keyboard shortcuts were already delivered in 1B.

Schema: `dimensions` added (optional, default empty); older files still open.

Screenshots: `docs/screenshots/editor-measure-rulers.png` (the measure shows the unused end of the Adventure Park table is 46.6 in) and `print-page.png`.

## Test results (clean `npm ci`)

| Command | Result |
|---|---|
| lint / typecheck | OK |
| `npm test` | **81 / 81 passed** (7 files) |
| `npm run build` | OK; app bundle 900 kB (267 kB gzipped), plus the service worker |
| `npm run test:e2e` | **36 passed**, 24 skipped (desktop-only and iPad-only tests skip on the other device) |

New browser tests:
- locking the module layer blocks selection, and unlocking restores it;
- measure 32 studs, keep it as a labelled dimension, and see it on the printout;
- the print page lists all 92 modules and the ride power, and the PNG and SVG downloads work;
- help opens on the right topic (editor and measure), search finds checkpoints, Escape closes;
- **works offline after the first visit**;
- large and tiny display performance (timings above).

## Bug found and fixed by the tests

- **Offline mode failed to load the app's script**, because the server's `Vary` header stopped the cached copy matching the browser's module-script request. Fixed by ignoring `Vary` for the built files. Without the test this would only have shown up at a show without wifi.

## Phase 1 gate (handoff §9)

| Gate | Status |
|---|---|
| 1A: survives close/reopen, duplicate/import/export, interrupted saves, safe restore | ✅ |
| 1B: lays out real MILS modules accurately; positions survive save/reopen; interactions pass browser tests | ✅ |
| 1C: objects placed/edited across MILS boundaries without ID or geometry corruption | ✅ |
| 1D: large-display fixture stays usable; undo/redo and save/recovery consistent | ✅ |
| `npm install`, `build`, `test`, browser smoke tests succeed reproducibly | ✅ (clean `npm ci` above; CI workflow runs the same) |
| 1E: cloud/collaboration | ⏸ not started; needs owner decisions |

## Known gaps

- **Real Safari/WebKit has not been tested** (not available here); touch is tested with Chromium touch events at iPad size. Please try it on the show iPad.
- **The multi-level shelf fixture** is covered by unit tests and a browser test (add a shelf, place a module, overview, reload). There is no realistic three-shelf sample project yet, because I have no real shelf dimensions.
- **Kingdom setup hints** are not written yet (decisions file).
