# Owner feedback log

Every request is logged here so nothing gets lost, including Phase 1 changes that come up
during later phases. Newest first.

## 31 Oct 2026, round 1 (after Phase 1)

| # | Request | What was done | Status |
|---|---|---|---|
| 1 | Colour choices should be real LEGO colours, not a gradient picker | 44 real LEGO colours by name (BrickLink/Rebrickable names); used for items, markers, plate colours; markers and starter parts switched to LEGO colours | Done |
| 2 | Autosave every few minutes, in case I forget to save | Already saves automatically about half a second after every change; the toolbar now shows "Saved 2:41 PM" so it's visible. Help updated | Done (explained) |
| 3 | Add standard MILS size 8×16 | "8×16" in the Modules palette: a 16×8 plate standing upright, A-xx ID | Done |
| 4 | Need to see studs to place things exactly | Studs drawn on plates (and bricks/plates) when zoomed in, only for what's on screen | Done |
| 5 | How do I create a new marker and add it to the list? | "+ New marker…" in Setup markers: name, size, round, LEGO colour, layer; kept in the list | Done |
| 6 | Is "Rides & buildings" where small items like a street light go? | No: rides & buildings are things on their own base. New "Small items" section with "New item…" | Done |
| 7 | Build layers on a plate (e.g. see where the sidewalk starts and finishes) | New projects get layers Plates → Surface details → Markers & small items; layers stack in order (▲▼); "New items" picks the layer; details on a plate move with it; small items only clash with others on the same layer | Done |
| 8 | MILS plate numbers as their own layer, for a view that looks like the finished product | "MILS IDs & names" can be shown or hidden like a layer; "Finished look" shows each plate in its real LEGO colour (set per plate) | Done |

Notes
- Projects created before this change keep their layers; use Layers → + Add layer to add "Surface details" if wanted.
- Plates without a plate colour show as Green in Finished look.
- Found while testing this round: clicks were matched to shapes using Konva's hit-detection canvas, which is redrawn on the next frame. On a busy computer a click right after a change could miss. Clicks are now matched from the layout itself (same stacking order as the screen), which is always current and also makes zooming cheaper.

## 31 Oct 2026, round 2

| # | Request | What was done | Status |
|---|---|---|---|
| 1 | Build a new layout "Development" | Blank "Development" project (3.5 × 8 ft table, three layers) is added to the project list automatically. Starters are now tracked one by one, so new ones appear and archived ones never come back | Done |
| 2 | Setup markers came over; each project should make its own | Setup markers list starts empty with "+ New marker…". The nine Adventure Park markers belong to the Adventure Park project only | Done |
| 3 | Small items = street lights, bushes and such | "Small items" holds only your own items ("+ New item…") | Done |
| 4 | Add a section "Single pieces" | "Single pieces": LEGO bricks, plates, tiles (with studs), "+ New piece…" | Done |
| 5 | Rename "Rides and buildings" to "Features" | Renamed everywhere (palette, details, counts, print, help) | Done |
| 6 | Give Claude access to the Development layout | `shared/` folder in the repo; upload the file there (or attach it in chat) and Claude can open it | Done; waiting for the file |

Note: projects already in your browser keep the markers they had. Delete them from the palette with × if you don't want them.

## 31 Oct 2026, round 3

| # | Request | What was done | Status |
|---|---|---|---|
| 1 | I use 1×1 round plates for walkways | Draw tool (2B) built around it; Plate Round 1×1 added | Done |
| 2 | Clearance zones and reusable designs before terrain | Order changed: 2C clearance zones, 2D reusable designs, then terrain | Planned → in progress |
| 3 | Put on the roadmap: choose single pieces from actual parts (plate vs tile both showed studs); don't want to recreate each part | Written into `docs/roadmap.md` as Phase 3. Now: about 60 real common pieces built in and searchable; tiles smooth; "New piece…" has "Smooth top (tile)" | Partly done now; full catalog Phase 3 |

## 31 Oct 2026, round 4

| # | Request / answer | What was done | Status |
|---|---|---|---|
| 1 | Mountains will be features built on their MILS plate; gradual slopes and elevation changes are stacked plates/parts | No separate terrain system. Draw tool "Stack on top" builds slopes layer by layer; "Shade by height" shows them like a relief map (needs Heights on) | Done |
| 2 | A feature built on a MILS plate still needs its studs visible | Features (rides, buildings on their base) now show studs when zoomed in, like every plate | Done |

## 31 Oct 2026, round 5 (from the uploaded Development layout)

| # | Request / finding | What was done | Status |
|---|---|---|---|
| 1 | A standalone module (e.g. "Castle Base", "Bridge") needs its real colour for Finished look | Plate colour picker is shown for every plate, features included; Finished look uses it | Done |
| 2 | Found in the file: "Castle Mountain overlaps Castle Base" warning, though the mountain is built on its base | Something sitting entirely on a plate or base is no longer an overlap; partly hanging off still warns | Done |
| 3 | Found in the file: the two names were drawn on top of each other | A plate with something built on it shows its name along the top edge | Done |
| 4 | Do curves next | Draw › Curve: click points, pieces are laid along a smooth curve as one group. Select it → Edit curve → drag the round handles to reshape (re-lays the pieces, one Undo) | Done |

## 31 Oct 2026, round 6

| # | Request | What was done | Status |
|---|---|---|---|
| 1 | Go ahead with stairs | Draw › Stairs: click start, turns, end; width, step depth, rise (1 plate / 2 plates / 1 brick), start height, landings at turns or every N steps, colour, smooth tops. Select → change any setting or Edit path (handles); steps are laid again, one Undo. Step heights work with Heights | Done |
| 2 | Go ahead with pattern stamping | Draw › Spacing: one piece every N studs along freehand, straight or curve strokes (grid for Fill box), with Turn (fixed or follow path). Designs can be stamped too (linked copies). Taken spots preview red and are skipped. One Undo per stroke | Done |

## 31 Oct 2026, round 7

| # | Request | What was done | Status |
|---|---|---|---|
| 1 | Go ahead with Phase 3 | 3A: real LEGO parts list (about 2,400 plain parts from Rebrickable's free downloads, shipped with the app so it works offline). Search Single pieces by name, size or part number; parts come in at real size, smooth tiles, heights; favourites ☆ and recently used; colours the part is made in come first; part numbers on the printout. Also answers the earlier request "choose single pieces from actual parts" | Done |
| 2 | (Phase 3, continued) | 3B: Parts & inventory (⋯ menu). Parts list per layout: needed / have / to buy. "Have" is one list for all projects on this device, typed in or imported from CSV (Rebrickable format works), exportable. Shopping list downloads in Rebrickable's CSV format → price it / make a BrickLink wanted list there | Done |

## 31 Oct 2026, round 8

| # | Request | What was done | Status |
|---|---|---|---|
| 1 | Brickwith or genuine depends on the display (castle and mountain: Brickwith first, then BrickLink; small display for official LEGO events: all genuine). A checkbox per layout | Parts list: "Use Brickwith first, BrickLink for the rest" per layout (off = genuine LEGO / BrickLink only). "Brickwith has it" per part and colour, remembered for all projects, or imported from CSV. Separate BrickLink and Brickwith shopping lists | Done |
| 2 | Track costs, even if estimated | Price each per supplier; usual price per piece for estimates (marked ~); estimate split by supplier; "Money spent on this layout" log saved with the layout | Done |

## 31 Oct 2026, round 9

| # | Request | What was done | Status |
|---|---|---|---|
| 1 | Go ahead with Phase 4 | 4A Physical builds (⋯ menu): track a real build with a permanent ID; storage, condition, progress steps, photos (kept on the device), setup notes, differences from design, history with notes and repairs; rebuilt (same ID), taken apart, replaced (new ID, old kept) | Done |
| 2 | (Phase 4, continued) | 4B Versions (⋯ menu): save named versions; compare two (pictures with removed/added/moved/changed marked, lists, part differences, extra-parts CSV); preferred version; open a version as a new project; go back to a version (current kept as a checkpoint) | Done |

## 1 Nov 2026, round 10

| # | Request | What was done | Status |
|---|---|---|---|
| 1 | Go ahead with Phase 5 (packing questions not answered, so built with flexible defaults) | 5A Packing and 5B Shows, both hidden until switched on in the ⋯ menu. See help topics "Packing" and "Shows" | Done |
| 2 | Go ahead with Phase 6 | Setup & helpers (⋯ menu): setup/teardown plan per show from the layout, helpers, logged overrides, timing, issues, printed guide with module maps, helper progress files merged with conflict choice. See help topic "Setup, teardown and helpers" | Done |
| 3 | Go ahead with Phase 7 | Back up everything / restore with a preview (Projects page); Display report and Share a read-only view (⋯ menu). See help topics "Backing up and restoring" and "Display report and sharing a view" | Done |
| 4 | Go ahead with OneDrive sync | Projects page: Set up OneDrive sync (guided app registration, client ID), Sign in to OneDrive per device; background sync of projects, parts list, versions, photos; conflicts asked; editor shows ☁ status and offers updates. Waiting on the owner's app registration to switch it on for real | Done (needs client ID) |
