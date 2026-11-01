# Roadmap

The phases from the requirements, with what is done, what's next, and owner requests
that are committed to a later phase. See `docs/feedback-log.md` for every request.

| Phase | What | Status |
|---|---|---|
| 1 | Core editor: projects, modules, objects, layers, measuring, print, help, offline | ✅ Done (1A–1D) |
| 1E | Cloud sync | Part done: "Save to a file" in the OneDrive folder. **Later:** in-app OneDrive sign-in, which also works on iPad (needs the Microsoft app registration) |
| 2 | Advanced design | 2A Heights ✅ · 2B Drawing ✅ · 2C Clearance zones ✅ · 2D Reusable designs ✅ · Terrain by stacking plates ✅ (mountains are features; slopes are stacked plates) · Editable curves ✅ · Stairs ✅ · Pattern stamping ✅ |
| 3 | Parts catalog, inventory, purchasing | 3A Parts catalog ✅ (about 2,400 real parts from Rebrickable, offline, search, favourites, recent, made-in colours, part numbers on the printout) · 3B Parts list, what you have, shopping list ✅ (Rebrickable CSV out; inventory CSV in/out) · 3C Sourcing and costs ✅ (per layout: Brickwith first with BrickLink fallback, or genuine LEGO only; reusable Brickwith cross-reference; prices, usual-price estimates, money spent) · Later: purchase orders and partial deliveries, budgets, reservations across projects |
| 4 | Physical assemblies, versions | 4A Physical builds ✅ (permanent IDs, storage, condition, repairs, history, photos on device, progress/steps, rebuild/take apart/replace) · 4B Versions ✅ (named versions on the device, preferred version, side-by-side comparison with marked changes, part differences and extra-parts list, open as new project, go back) |
| 5 | Exhibitions, transport, packing | 5A Packing ✅ (containers with permanent IDs, nesting, sizes/weights, storage, handling, equipment, history, retire; labels with QR lookup) · 5B Shows ✅ (calendar with clash warnings, what goes / last-minute omissions, separate packed/loaded/unloaded/back-home checklist, trips with cargo space, printed lists, done record) · Later: scaled venue floor plans, sharing one build or box between projects' shows |
| 6 | Setup, teardown, helpers | 6A Setup plan ✅ (tasks from the layout, left to right, put-out tasks from setup markers, own tasks, required/preferred order with logged overrides, assign/claim/done/reopen, timing, issues log, printed guide with module maps) · 6B Helpers on their own devices ✅ (progress files merged with conflict choice) · Later: live shared sessions once cloud sync exists |
| 7 | Reporting, sharing, backups | Planned |

## Committed owner requests (later phases)

- **Choose single pieces from the actual LEGO parts catalog** (owner, 31 Oct 2026), so parts never have to be recreated, and plates vs tiles (studs or smooth), sizes and real colours come from the part itself. **Phase 3.**
  - Plan: use an openly available parts list (Rebrickable's downloadable catalog, BrickLink numbers) cached offline. Search by name, size or part number. Keep a project's used parts available without internet.
  - Already now: about 60 common plates, tiles, bricks and rounds are built in (with BrickLink numbers for reference), searchable in Single pieces. Tiles are smooth, and "New piece…" has a "Smooth top" option.
- **One shared list of markers / items across projects** (offered; owner chose per-project for now). It can be added later if wanted.
- **In-app OneDrive sync** (option A), for iPad use at shows.
- **Kingdom setup hints:** to be written by the owner.
