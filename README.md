# Brickwood Layout Designer

Browser-based overhead layout designer for Brickwood Builds LEGO exhibition displays.
It replaces the Visio drawings first, then grows into planning, packing and setup.

**Status: Milestone 1C (object editor).** Projects, local storage, export/import,
recovery checkpoints, both starter displays, the MILS editor, setup markers, items and groups work.
Milestone reports: [1A](docs/milestone-1a-report.md), [1B](docs/milestone-1b-report.md), [1C](docs/milestone-1c-report.md).

## Run it

Needs Node 22+ and npm.

```bash
npm install
```

```bash
npm run dev
```

Then open the printed URL in Chrome (desktop) or Safari (iPad on the same network: `npm run dev -- --host`).

## Checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, strict |
| `npm test` | Vitest unit + persistence tests (IndexedDB via fake-indexeddb) |
| `npm run build` | Static production build in `dist/` (works from GitHub Pages; relative paths) |
| `npm run test:e2e` | Playwright smoke tests: desktop Chrome and an iPad-sized touch viewport |

First-time e2e on a new machine: `npx playwright install chromium`.
CI runs all of these on every push (`.github/workflows/ci.yml`).

## Layout

```
src/domain/    Renderer-independent model: Zod schema, units, geometry, migrations, export format
src/editor/    Editor: Konva canvas, pointer/touch input, Zustand store, autosave, panels
src/storage/   Dexie (IndexedDB) database and the ProjectRepository (all writes are transactions)
src/starters/  Visio CSV -> starter projects (Adventure Park, Kingdom Village)
scripts/       vsdx_to_csv.py: export a Visio page to rows for docs/brickwood-visio-layouts.csv
src/ui/        React screens: dashboard, overhead view, dialogs
tests/unit/    Vitest
e2e/           Playwright
docs/          Requirements, owner decisions, Visio data, milestone reports
```

## Key rules

- Studs are canonical (1 stud = 8 mm); inches/cm are display only. The Visio drawings use
  10 in = 32 studs, so the CSV import uses `studs = inches × 3.2` and snaps to whole studs.
- Origin is the upper-left of the level; X right, Y down.
- Every record has a permanent UUID. MILS labels (written on the back of the plate) are separate,
  user-editable and never reused once retired.
- No paid services. Data lives in the browser; export files are the backup.
