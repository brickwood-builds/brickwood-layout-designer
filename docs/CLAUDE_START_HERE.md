# Brickwood Layout Designer — Complete Development Handoff

**Version:** 1.1 | **Date:** October 30, 2026 | **Status:** Approved requirements; greenfield implementation. No existing code is supplied or to be reused.  
**Audience:** Claude or another development assistant taking over implementation.  
**Product owner:** Brickwood Builds.  
**Important:** This handoff is the roadmap, not a claim that all described features have been coded.

## 1. Executive summary

Brickwood Layout Designer is a browser-based, offline-capable, 2D overhead planning and operations system for large LEGO and compatible-brick exhibitions. It replaces manual color coding and Visio-style drawings with precise MILS/stud-level design, reusable pieces and assemblies, inventory and purchasing, physical build tracking, transport packing, venue planning, show setup, and event history. The owner has two existing displays to redesign. Preserve the complete long-term product vision while delivering functionality incrementally.

The primary workflow is to see an entire display from overhead, zoom into individual MILS modules and studs, place and move objects, then generate reliable setup, packing, and print information. The system must remain practical for real-world traveling LEGO displays, not merely a generic vector drawing tool.

**Operating directives:** Use sensible technical defaults without repeatedly asking the owner to choose between implementation options. Ask before changes affecting user-facing functionality, scope, cost, or major data compatibility. Avoid paid services without explicit approval. Do not claim success without running tests. Maintain a working, downloadable source package and a candid progress report after each milestone.

## 2. Authoritative source files and precedence

1. This handoff is the implementation guide for a new implementation.
2. `Brickwood_Layout_Designer_Master_Requirements_Specification_v1_1.docx` is the detailed functional requirements baseline, including stable FR IDs, priorities, and acceptance statements. **Read it completely**; it contains requirements not repeated word-for-word here.
3. `Brickwood_Layout_Designer_Master_Requirements_Specification_v1.docx` is historical baseline.
4. **No previous source code is included.** Build a new application from scratch; do not seek or reuse prior Alpha versions.
5. If a mismatch appears, preserve existing approved functionality and flag substantive conflicts to the owner; do not silently discard requirements.

Note: The master requirements document may contain older planning references. This greenfield handoff controls the development starting point: no existing application or codebase is assumed.

## 3. Product principles and immutable distinctions

- 2D overhead, layer-aware editing with physical height awareness; no full 3D editor required.
- Studs are canonical horizontal units; plates are canonical vertical units; inches/cm are derived presentation units.
- A project may have multiple independent horizontal display levels, with separate supports, footprints and elevation. Combined overhead alignment must be possible.
- Distinguish catalog part definitions, canvas object instances, reusable design assemblies, unique physical assembly copies, named groups, transport units, boxes, and inventory records. These are NOT interchangeable.
- An object can cross several MILS modules; geometry does not imply physical ownership. Canvas selection defaults to individual piece, except explicitly named group behavior.
- No inventory auto-reservation merely because a design is copied. Inventory states must not double-count.
- Warnings for intentional overlap/overhang should be advisory, acknowledgeable, and auditable where relevant.
- User-selected Google Drive, OneDrive, or Dropbox is primary project cloud storage in the eventual hybrid model; local editing must work offline. A separate managed backend coordinates revisions, permissions and protected transactions.
- Preserve identities, history, recoverability, safe migrations, and reversible changes. Never silently overwrite meaningful data.

## 4. User workflow and editor experience

Initial desktop-first workspace: top toolbar, left Project Explorer/Catalog switcher, central overhead canvas, right properties panel, bottom status bar. Panels resizable/collapsible. Default fit-to-display, grid visible, full-stud snapping, upper-left origin, visible MILS labels, autosave, system theme.

Interaction baseline: click selects; Shift-click multi-select; drag empty area for marquee; drag objects to move; wheel zoom at pointer; middle mouse or Space-drag pan; arrows nudge at snap increment; Shift-arrows 10 studs; Delete, copy/paste, undo/redo, Escape cancel; context menus; double-click enter group or properties. Use explicit interaction mode so panning and marquee don't conflict.

MILS: standard 32×32, 32×16, 16×16 plus custom rectangular. Auto labels with manual override and permanent UUID. Flexible display footprint and temporary off-display construction area; warn on overhang. For MILS in transport units, later prompt move unit / detach / cancel. Modules may be physically fixed to larger assemblies.

Objects: starter bricks, plates, tiles and reusable user-defined rectangles; full-stud, half-stud, free placement in first editor; known connection points later. Numeric X/Y, rotation, dimensions, color, notes, layer, IDs. Early rotation 90°; later arbitrary angles. Preserve exact coordinates and future height fields. Collision previews must permit intentional overlap.

Groups: persistent named groups initially, nesting later; independent/linked assembly copies later. Undo one logical operation at a time, including whole group moves or brush strokes.

## 5. Geometry and rendering

Use React + TypeScript, Konva/React Konva for the editor, SVG/HTML overlays where appropriate, and a renderer-independent geometry library. Use RBush or similar spatial indexing for footprint queries. Geometry must not depend on Konva node state. Support cross-MILS placement and negative coordinates. Horizontal coordinate origin upper-left, X right, Y down; Z upward in plate units. Store decimal stud coordinates; do not round canonical data to inches.

Future geometry: irregular footprints and connection points when known, simplified footprints otherwise; automatic stacking with manual overrides, active construction height, stack inspector and height filtering; elevation volumes for terrain (excluded from inventory), exposed stair paths with landings/turns, bridges, clearance zones for moving attractions, removable terrain insertion directions and attachment points. Support three-level shelf displays and cross-level clearance without requiring full 3D.

## 6. Complete functional workstreams (beyond initial editor)

### 6.1 Projects, levels and navigation
Multiple projects; duplicate/archive/rename; templates; flexible display footprints; saved navigation views; search by name/ID/type; jump to canvas; ruler and saved dimensions; separate independent display levels with horizontal offsets and elevation; level visibility and cross-level alignment.

### 6.2 Advanced design tools
Brush repeated placement, straight start/end lines, freehand, controlled editable curves, pattern stamping, spacing/rotation, collision policies skip/replace/overlap/stop, one undo per stroke, geometry/height awareness, complex stairs, terrain, clearance warnings and acknowledgement.

### 6.3 Catalog, inventory and purchasing
Hybrid offline catalog cache for used/favorites/recent with full online lookup; BrickLink preferred where permissible, Brickwith supplier mappings, CSV/manual import. Loose/reserved/installed/needed/on-order inventory with auditable movements; approved alternatives preserving original/substitute; supplier part mappings, consolidated shopping lists, price estimates, budgets, POs, partial deliveries, purchase history, supplier CSV import/export. Respect third-party APIs, trademarks and licensing.

### 6.4 Assemblies and physical construction
Separate reusable assembly designs, linked/independent instances, versioned design updates, unique physical copies with condition/storage/repair history/photos, deviations, build readiness and progress, physical identity retention across rebuilds, replacement identities for distinct copies. Removable terrain instructions and attachment points. Design vs physically built state must be explicit.

### 6.5 Show setup and documentation
MILS-first setup sequence, then loose pieces, custom moving layers; fixed items excluded from setup lists. Individual/category checklists, helpers claim/complete/reopen, required/preferred dependencies with override and audit, assembly notes/photos, height/layer references, Print Center for MILS, grouped sections, transport units, branded printable guides and QR labels for lookup only.

### 6.6 Transport and venue
Transport boxes, individually tracked contents, transport units and removable objects, storage location, vehicle/trip assignment and 2D loading plans, overlap warnings, loading/unloading checklists, non-LEGO accessories for packing only. Venue scaled 2D plans with tables, aisles, barriers, power, notes, configurations and validation. Multiple displays and levels must be supported.

### 6.7 Exhibitions, versions, sharing and operations
Named versions/branches, visual and part-count comparisons, redesign shopping lists, saved venue configurations, event-linked versions, event setup/teardown timing, photos, helpers, recurring repairs/issues, persistent history. Read-only sharing private/unlisted/public with expiry/revocation; invited helper offline sessions and later reconciliation. Activity history, recovery/restore preview, project/full-account backups, compatibility migration, performance and diagnostics.

## 7. Technical architecture decisions

**Frontend:** React + TypeScript + Vite. **Canvas:** Konva.js/React Konva plus SVG/HTML overlays. **Geometry:** TypeScript, RBush. **Offline:** IndexedDB/Dexie. **State:** Zustand editor state; TanStack Query for server state when introduced. **Validation:** Zod. **Testing:** Vitest, Playwright, integration tests. **Source/CI:** Git/GitHub Actions.

**Future backend:** Node.js + NestJS, PostgreSQL + Prisma/Migrate, BullMQ + Redis for jobs, REST/OpenAPI for data, WebSockets for notifications, OAuth/OIDC for optional Microsoft/Google sign-in and native account support, role-based permissions. Shared domain contracts between client/server. User-selectable Google Drive/OneDrive/Dropbox project storage with resilient sync. Browser Web Workers for expensive local operations. Sharp for images, suitable PDF library for print. Structured logs/diagnostics with privacy protections.

**Deployment:** Static host may serve first offline editor; GitHub for source and CI. Google Cloud is a candidate, not an approved paid deployment. GitHub Pages cannot host NestJS/PostgreSQL/Redis. No subscriptions, paid APIs, or usage-based infrastructure without approval. Provider portability is preferred.

**Security/data:** UUIDs, revision checks, optimistic edits, stronger server transactions for inventory/purchasing/identity, safe migrations, explicit conflict handling, encrypted transport, least-privilege connectors, controlled archive/delete, backups independent of sync. Offline local storage is not a complete backup.

## 8. Phase-by-phase roadmap

**Phase 1 — First usable editor:** Project creation/open/rename/duplicate/archive; local IndexedDB persistence; project import/export; recovery checkpoints; MILS layouts; flexible footprint and basic display levels; 2D zoom/pan; starter catalog and custom rectangles; placement, snapping, collision warnings; selection, movement, rotation, basic groups/layers; properties; undo/redo; overhead export; tests. Implement only what is needed but preserve future-compatible identities and geometry.

**Phase 2 — Advanced design:** Height/stacking, irregular geometry, brush/lines/curves/patterns, terrain, stairs, clearance, richer grouping and assemblies.

**Phase 3 — Catalog, inventory and purchasing:** Integrations, imports, stock states, substitutions, sourcing, pricing, POs, budgets.

**Phase 4 — Physical builds, versions and reusable assemblies:** Design/physical instance separation, build progress, repair records, photos, branches, comparisons, versioned assemblies.

**Phase 5 — Transport and exhibition logistics:** Boxes, loading, vehicles, venues, configurations, accessories, packing.

**Phase 6 — Show setup and collaboration:** Checklists, helpers, offline shared sessions, permissions, setup documentation, activity history.

**Phase 7 — Publishing and production readiness:** Print Center, branded guides, sharing portal, robust deployment, backups, performance, security and operational hardening.

Cloud coordination may be introduced after the initial local editor and before collaboration-dependent capabilities; it is not a prerequisite for basic canvas editing. Do not treat phase assignments as permanent removal of approved requirements.

## 9. Phase 1 implementation backlog and exit gates

**1A Foundation:** Establish monorepo/application structure, schemas/IDs, IndexedDB transactions, project dashboard, project CRUD, import/export, checkpoints, automated persistence tests. Gate: project survives close/reopen, duplicate/import/export, interrupted saves and safe restore.

**1B MILS editor:** Canvas, coordinates, grid, fit, zoom/pan, MILS creation/selection/move/rotate, labels, snapping, warnings, persistence. Gate: accurately lay out real MILS modules; positions survive save/reopen; interactions pass browser tests.

**1C Object editor:** Starter catalog and custom rectangles, object instances, geometry queries, drag/drop, selection/multi-select, full/half/free snap, 90° rotation, properties, collision acknowledgement, groups. Gate: place/edit objects across MILS boundaries without ID or geometry corruption.

**1D Refinement:** Layers, undo/redo command system, validation panel, ruler, basic export/print, keyboard shortcuts, performance tuning. Gate: realistic large-display fixture remains usable; undo/redo and save/recovery consistent.

**1E Cloud/collaboration foundation (later):** Auth, server revision coordination, selected cloud connector, permissions, conflict review, sync status. Gate: offline changes reconcile safely without silent overwrites; requires cost/security review before provisioning.

### Mandatory test fixtures
- Small 2×2 arrangement of 32×32 MILS.
- Castle/mountain: 80×64-stud mountain and a separate 64×48-stud castle base; multi-module footprint and cross-module structure.
- Large exhibition: approximately 42×42-inch display footprint with many modules and placed objects.
- Multi-level shelf arrangement with distinct support surfaces and elevations (as the level model is implemented).

### Mandatory quality gates
`npm install`, `npm run build`, `npm test`, and browser smoke tests must succeed in a reproducible environment. Check save/reopen, import/export, invalid files, checkpoint restore, pointer drag, zoom-dependent snapping, keyboard controls, overlap warnings, and browser reload. Document actual commands and results. Do not label an alpha 'working' merely because the ZIP extracts.

## 10. Starting point — greenfield project

**Implementation status:** No application source code is provided. All features are requirements, not delivered functionality. The prior experimental Alpha prototypes are intentionally excluded. Claude should create a new repository and implement the application from the ground up, using the approved product and technical decisions as guidance. Do not claim a feature is implemented until it is coded, built, and tested.

**First deliverable:** A clean React + TypeScript + Vite repository, with documented setup, lint/type-check/build/test scripts, a reliable domain model, project storage, and an initial MILS editor. Use incremental milestones and verify each before proceeding.

## 11. First instructions to Claude (recommended execution sequence)

1. Read this handoff and the entire v1.1 master requirements before writing code. Produce a concise implementation backlog mapped to the requirements IDs.
2. Create a fresh repository and project structure. Select maintained compatible dependency versions; do not copy or search for earlier Alpha source code.
3. Define stable domain contracts for projects, layouts, display levels, MILS modules, catalog definitions, object instances, groups, layers and assemblies. Implement only the first milestone's active features, but avoid data-model shortcuts that block later phases.
4. Set up automated type-checking, unit tests, browser smoke tests, and continuous integration before substantial UI expansion.
5. Implement project creation, local persistence, export/import and recovery; then build the overhead MILS editor with selection, placement, snapping, movement, zoom and pan.
6. Validate the first milestone against realistic LEGO display fixtures and document failures or incomplete requirements honestly.
7. At each milestone, provide a source ZIP or repository link, setup/run commands, passing test evidence, known issues, and the next concrete tasks. Obtain approval before paid services or material scope changes.

**Suggested initial Claude prompt:** 'Build Brickwood Layout Designer from scratch. Read CLAUDE_START_HERE.md and the full v1.1 master requirements first. There is intentionally no prior source code to reuse. Create a fresh, maintainable implementation using the approved stack, implement Phase 1 incrementally, and demonstrate successful builds and tests. Preserve the complete long-term requirements; ask only about major functionality, compatibility or cost decisions.'

## 12. Open risks and decisions

- Exact hosting, cloud provider deployment and pricing require explicit approval before spend.
- External catalog APIs and licensing must be checked before integration.
- Browser IndexedDB may be deleted; independent backup and export are necessary.
- Offline shared editing and multi-provider cloud sync are complex; implement revision/conflict contracts early, sync later.
- Performance targets must be benchmarked with realistic object counts; no untested numeric performance guarantees.
- Final UX design is conceptual, not pixel-approved. The owner has delegated routine technical details but should review meaningful interaction changes.
- The owner prefers building from a reasonably complete plan, with flexible practical refinements rather than prototyping every feature.

## 13. Project-specific reference scenario

A representative Brickwood Kingdom test scenario includes a custom 64×48-stud castle foundation and an approximately 80×64-stud, 10-inch-tall mountain split across MILS boundaries, plus a separate 32×64-stud stair mini-mountain. The wider display is roughly 42×42 inches. These examples validate cross-module structures, physical movement, elevations and future assembly/transport relationships. They are sample fixture requirements, not hard-coded application dimensions.

## 14. Definition of a trustworthy handoff

A developer can identify all approved requirements, start a clean repository, build and test the first milestone, and preserve the longer-term scope. There is no inherited implementation to audit or maintain.
