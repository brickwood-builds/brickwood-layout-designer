# Milestone 1A — Foundation: progress report

**Date:** 30 Oct 2026 · **Branch:** `milestone-1a`

## What was delivered

- **Fresh Vite + React 19 + TypeScript (strict) app**, with ESLint, Vitest, Playwright and a GitHub Actions CI workflow. No prior code was reused.
- **Domain model (Zod, `schemaVersion: 1`)** in `src/domain/schema.ts`: project, display level, table (support surface), MILS module, canvas object (ride/building footprint, setup marker, item), layer and group. It also holds settings, hidden advanced-feature flags and retired MILS labels.
- **Local persistence (Dexie/IndexedDB)** in `src/storage/repository.ts`:
  - create, open, rename, duplicate and archive/unarchive projects;
  - every write is one transaction, with an optimistic revision check (stale saves are rejected, never silently overwritten) and a fresh `revisionId` per save so cloud sync can be added later;
  - the browser is asked for persistent storage so it is less likely to evict data.
- **Recovery checkpoints**:
  - created automatically on the first save, then at most every 10 minutes, before every restore, or on demand;
  - capped at 25 per project;
  - restore shows a preview first, keeps the project ID and can itself be undone;
  - a damaged stored project is reported on the dashboard and can be restored from a checkpoint.
- **Export/import** as `.brickwood.json` (versioned envelope):
  - all IDs and decimal coordinates survive a round trip;
  - importing a project that already exists creates a copy rather than overwriting;
  - invalid, foreign or newer-format files are rejected with a readable message.
- **Both Visio displays as starter projects**, added automatically on first run:
  - **Brickwood Adventure Park**: the current **12 ft layout (Visio v7, "Redessign" page)**: 92 modules (13 × 32×32, 52 × 16×16, 27 × 16×8), 16 ride/attraction footprints with power in volts, one 2×10 item. It sits at the left end of the 42 × 186 in table, leaving about 3.9 ft unused at the right, as at the 2026 show.
  - **Brickwood Kingdom (Village)**: 20 × 16×16 and 5 × 32×32 village modules plus 14 buildings built directly on their plates (one unit each, no plate ID), on a 42 × 96 in table.
  - Both import with **zero overlaps and zero overhang warnings**. Starter IDs are deterministic, so the same physical plate has the same UUID on every device.
- **Basic dashboard**:
  - project cards with an overhead preview, plus New project (empty table or from either starter), Import, and a More menu (Rename, Duplicate, Export file, Checkpoints, Archive). Archived projects are hidden unless "Show archived" is ticked;
  - opening a project shows a labelled overhead view with a colour legend and a layout-warning count. This view is read-only until 1B.
  - advanced areas (heights, inventory, versions, exhibitions, transport, helpers) exist only as off-by-default flags, so there is no UI for them.

Screenshots: `docs/screenshots/` (dashboard, Adventure Park, Kingdom, iPad viewport).

## Test results (clean `npm ci`, 30 Oct 2026)

| Command | Result |
|---|---|
| `npm ci` | OK, 0 vulnerabilities |
| `npm run lint` | OK, 0 problems |
| `npm run typecheck` | OK |
| `npm test` | **38 / 38 passed** (3 files) |
| `npm run build` | OK (479 kB JS, 140 kB gzipped) |
| `npm run test:e2e` | **12 / 12 passed** (6 scenarios × desktop Chrome + iPad touch viewport) |

Unit and persistence tests cover:
- survives close/reopen;
- rename, archive and duplicate;
- stale-revision rejection;
- an **interrupted save** (an exception injected inside the transaction) leaves the previous version and creates no checkpoint;
- invalid data refused at the storage boundary;
- checkpoint timing, preview, restore and undo-restore;
- checkpoint cap;
- recovery of a damaged record;
- export/import round trip, import-as-copy, and rejection of invalid files;
- seeding the starters only once;
- for both starters: module counts, label normalisation, ride power, Y-axis flip, custom base sizes, everything on the table with no overlaps, table sizes and deterministic IDs;
- the 2×2 32×32 fixture;
- advisory warnings (overhang names the table, overlap, duplicate label, retired label) that do not change the data.

Browser smoke tests cover:
- first-run starters;
- opening a project and surviving a reload;
- create, rename, duplicate and archive persisting across a reload;
- creating a project from a starter;
- export, re-import as a copy, and rejecting an invalid file;
- checkpoint preview and restore.

## Handoff gate (1A) status

| Gate item | Status |
|---|---|
| Project survives close/reopen | ✅ unit (DB closed and reopened) and e2e (page reload) |
| Duplicate / import / export | ✅ |
| Interrupted saves | ✅ transactional; tested by injecting a failure before commit |
| Safe restore | ✅ preview first; current version checkpointed before restore |

## How the CSV was converted

- `studs = inches × 3.2` (Visio scale), positions snapped to whole studs. Tables use the exact physical scale (1 in = 3.175 studs), so the 186 in table is 590.55 studs.
- Y flipped from Visio's bottom-left/Y-up to the app's upper-left/Y-down. Visio rotation (CCW) is converted to app rotation (CW).
- Each layout is centred on its table, with the same whole-stud offset for every shape.
- Adjustments made during import (shown in the import notes and covered by tests):
  - `C10` → **`C-10`**, to match the A-xx/B-xx/C-xx convention;
  - two zero-size connector lines in the Adventure Park drawing were skipped;
  - one unfilled `2x10` shape was imported as a generic item;
  - the 14 Kingdom buildings (Tavern, Mountain Castle and so on) are built directly on their plate and move as one unit, so **they have no plate ID**; the building name is shown instead;
  - Adventure Park comes from `docs/source/Amusement_Layout_v7 - 12 foot.vsdx`, converted with `scripts/vsdx_to_csv.py` into the CSV as `AdventurePark_12ft_v7` (v5 rows kept for reference). Compared with v5: Loop Coaster, Twisted Tracks, Petting Zoo, Carousel 2 and 17 right-end modules are gone; Blast Off, an Entrance, B-57/B-58 and A-29–A-31 moved left; new 16×16 plates **AA–EE** were added (labels kept as drawn);
  - one unlabelled 32×32 off the v7 drawing page is a leftover in the drawing and is left out.
- `AdventurePark_BaseplatesWithComponents_v5` (the older layout) was **not** imported as a project. Its marker vocabulary is captured in `src/domain/markers.ts` for the object editor in 1C.

## Owner answers (30 Oct 2026)

- **Carousel:** confirmed — *Carousel* is the Big Carousel (9 V); the Small Carousel is in storage and not in the display.
- **Adventure Park layout:** `Amusement_Layout_v7 - 12 foot.vsdx` is the latest true version. For the 2026 show the display was cut to about 12 ft on the same table, leaving 3.5–4 ft unused, so the starter uses v7, aligned to the left end of the 15.5 ft table.
- **AA–EE** are placeholder names for new plates; real IDs come later (never B-24 to B-27). The 32×32 off the v7 page is a leftover, not a real plate.
- **Kingdom buildings:** built directly on their MILS plate as one unit; plates don't need labels. MILS IDs are now optional; unlabelled plates are shown by name and skipped by the duplicate-ID check.

## Still open

1. **Duplicate keeps module IDs:** a duplicated project refers to the *same physical plates*, so module UUIDs are kept and only the project ID is new. Say if you would rather duplicates get new module identities.
2. **The CSV's "16×8" (A-xx) modules** are supported as a standard size alongside the spec's 32×16.

## Known gaps / honest notes

- The **project view is read-only**. Selection, drag, zoom/pan and MILS editing are Milestone 1B.
- The iPad test runs Chromium with an iPad viewport and touch. **Real Safari/WebKit has not been tested** (it is not installed here). Worth a manual check on the show iPad.
- Multiple levels exist in the data model and storage, but there is no UI to add a second level yet (planned for 1B).
- There is no GitHub Pages deploy workflow yet. The build is Pages-ready (relative base), but Pages has to be enabled in the repo settings first.
- The help system is planned for 1D (owner decision 3).
- I kept a single app instead of a multi-package monorepo. The domain code is isolated in `src/domain` and can move to a shared package when a server is added.

## Requirement traceability (1A scope)

| Requirement | 1A delivery |
|---|---|
| FR-01.01 projects CRUD | Create, rename, duplicate, archive, switch; persists independently |
| FR-01.02 MILS sizes | Model supports 16×8, 16×16, 32×16, 32×32 and custom; editor in 1B |
| FR-01.03 MILS IDs | Permanent UUID plus editable label; duplicate/retired label warnings |
| FR-01.04 footprint/overhang | Table modelled as its own object; per-level overhang warnings |
| FR-02.01–02.04 levels | Level model (elevation, offset, visibility) and per-level checks; UI in 1B |
| FR-13.03 no silent overwrite | Revision check on every save; import never overwrites |
| FR-13.04 recovery snapshots | Checkpoints with preview and restore |
| FR-13.05 stable IDs / migrations | Schema version plus migration pipeline; rejects newer formats |
| TR-28 revisions | `revision` and `revisionId` on every saved project, ready for sync |
| TR-30 backup independence | Export files plus checkpoints, separate from the working copy |

## Next: Milestone 1B (MILS editor)

1. Konva canvas: fit-to-table, zoom at pointer, pinch-zoom and pan (touch and mouse), grid.
2. Select, multi-select, drag and rotate MILS with full-stud snapping; autosave through `saveProject`.
3. Add, delete and relabel modules, with validation (unique, not retired).
4. Properties panel (label, name, size, position in studs/in/cm).
5. Level add/rename/elevation.
6. Browser tests for drag, snapping, keyboard nudge, reload persistence and the iPad touch viewport.
