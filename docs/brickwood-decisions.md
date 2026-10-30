# Brickwood Layout Designer — Decisions & Context (30 Oct 2026)

Supplements CLAUDE_START_HERE.md / handoff and Master Requirements v1.1. Read those plus this before building. Where this file conflicts with the handoff, this file wins.

## Owner direction
- **Must feel "basic."** Started as a Visio replacement. Default UI = overhead table + modules + ride/building footprints + small items, drag to arrange. All advanced areas (heights, inventory, versions, exhibitions, boxes, helpers) hidden until the user enables/uses them. One obvious way per task; defaults over settings dialogs.
- **No cost.** Free only: GitHub repo + GitHub Pages hosting, browser storage + export files. No paid backend/APIs without explicit approval. Future cloud sync via user's own Drive/OneDrive/Dropbox free APIs.
- Browsers: Chrome on desktop primary; **iPad Safari (touch) at shows**.

## Resolved conflicts (handoff wins over spec)
1. Build now; data model/backlog produced as part of Milestone 1A, not as separate approval docs.
2. Local-first for Phase 1; sync-ready revision IDs in the data model. Cloud sync deferred (spec's P1 sync gate not met in Phase 1).
3. Lightweight bundled offline help included in Phase 1D.
4. Multi-level display levels modeled from day one; per-level editing in Phase 1.

## Physical facts
- **Tables (support surfaces):**
  - Brickwood Kingdom (Village): 6 ft folding table topped with 3.5 × 8 ft plywood (42 × 96 in).
  - Brickwood Adventure Park: two 6 ft folding tables, 3.5 × 15.5 ft surface (42 × 186 in).
- Model the table as its own object; overhang warnings vs table edge. Tables are reusable equipment.
- Exact scale: stud = 8 mm; 32 studs = 10.08 in. Visio drawings use 32 studs = 10 in (≈1.5 in drift over long runs) — app uses exact studs. When importing the CSV, convert inches → studs as `studs = inches * 3.2` (i.e. Visio's 10 in = 32 studs), then snap to the stud grid.
- MILS ID is written on the **back** of each plate (old printed label tiles removed). User-set label + permanent internal UUID; label printing optional.
- Label convention: A-xx = 16×8, B-xx = 16×16, C-xx = 32×32; Village modules use "-V" suffix (B01-V, C01-V). Retired IDs never reused (e.g. B24–B27 removed).

## Source drawings → docs/brickwood-visio-layouts.csv
Columns: display, label_text, x_in, y_in, w_in, h_in, angle_rad, fill. x/y are shape centers in Visio inches, origin bottom-left, Y up (flip to app's upper-left / Y-down). Commas in labels replaced with `;`, line breaks with ` | `.
- `AdventurePark_12ft_v7` — **the current Adventure Park layout (added 30 Oct 2026)**: "Redessign" page of `docs/source/Amusement_Layout_v7 - 12 foot.vsdx` (exported with `scripts/vsdx_to_csv.py`). ~12 ft (138 in drawing page) on the same 15.5 ft table, built from the left end; about 3.5–4 ft of table is unused. 92 modules (13×32×32, 52×16×16, 27×16×8, incl. new AA–EE), 16 ride footprints; Loop Coaster, Twisted Tracks, Petting Zoo and the Small Carousel (in storage) are not in it. AA–EE are placeholder names until real IDs are assigned. A 32×32 off the page is a leftover and is ignored.
- `AdventurePark_BaseplatesLayout_v5` — previous (longer) Adventure Park layout, kept for reference (~104 modules: 17×32×32, 56×16×16, 31×16×8; ~183 × 40 in) plus ride footprints (Ferris Wheel, Timber Wolf, Roller Coaster, Loop Coaster, Twisted Tracks, Carousel / Carousel 2, Swings, Mixer, Blast Off, Green Machine, Bumper Cars, ATVs and Rafts, Ski Lift, Giant Slides, Petting Zoo, Entrances, Arcade, Hot Dog…).
- `AdventurePark_BaseplatesWithComponents_v5` — older module layout with small components (benches "BENCH"/"B", trees, lamps "L", flowers, food stands, "FP"/"P"/"T" markers). Use for the component/setup-marker vocabulary and placement examples.
- `Kingdom_Village` — Brickwood Kingdom, ~90 × 40 in; 16×16 (B01-V…) and 32×32 (C01-V…) modules plus custom bases 48×48, 64×64, 32×48 studs (Mountain Castle, Jousting, Tavern, Horse Head Inn, Ship Wreck, Castle Ruins, Church, Farmhouse, Bridge, River, Witch's House, Armorer, Sentry Tower, Central Well).
- Shapes with module-size text ("16x16 | B-07") are MILS modules; named shapes are ride/building footprints sitting on modules. Fill colors: purple #ab9ac0 = 16×8, blue #4bacc6 = 16×16, green #92d050 = 32×32, red #c05046 = rides/attractions.
- The original Visio also has Trailer Layout and Boxes pages (Phase 5 reference; not exported).

## Setup notes (Adventure Park)
- Build left to right.
- Setup markers = colored placeholder bricks: tables/benches green or orange single dot; flowers brown 1×4 square; trees sand 1×4; lamps white 2×2 square; trash cans dark/light gray 2×2 round; bushes bright green 2×2 round; bears light gray 2×2 square; pine trees bright green 2×2 square; flower pots dark green 2×2 plate with center stud. → model as "setup marker" object type.
- Ride power (likely volts): Loop 4.5, Blast Off 4.5, Small Carousel 7.5, Twisted Tracks L/R 7.5, Swings 9, Ferris Wheel 9, Mixer 7.5, Timber Wolf 9, Big Carousel 9, Rafts 4.5, ATVs 4.5, Ski Lift 4.5, Green Machine 6, Coaster 9. → ride property for later power/packing planning.
- Kingdom setup hints: not yet written.

## Milestone 1A (next)
Scaffold Vite+React+TS, Vitest, Playwright, CI; Zod domain model (project, table surface, level, MILS module, footprint object, setup marker, layer, group) with schema versioning; Dexie persistence, project CRUD, export/import, recovery checkpoints, tests; both Visio layouts as starter projects; simple dashboard with overhead preview. Push with test evidence.

## Owner answers (30 Oct 2026, after Phase 1)
- Rides are built on their own bases (like the Kingdom buildings): modelled as named base modules with no plate ID, with ride power.
- Moving a game/module moves the setup markers sitting on it. Taking something off for packing (Phase 5) is not a move: its markers stay.
- Merge to `main` and host on GitHub Pages: approved.
- Cloud sync (1E): OneDrive first.
- AA–EE are placeholder IDs for new 16×16 plates. The 32×32 off the v7 page is a leftover in the drawing.

