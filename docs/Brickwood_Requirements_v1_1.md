Version 1.0 — consolidated planning baseline \| 30 October 2026

Status: Approved functional direction; technical design and
implementation not started.

# Document control

**Product:** Brickwood Layout Designer (formerly LEGO Layout Designer)

**Purpose:** Browser-based planning, building, inventory, transportation
and exhibition management for large LEGO and compatible-brick displays.

**Scope:** All approved requirements retained; phased delivery, no
permanent scope reductions.

**Evidence basis:** Prior requirements decisions and eight-area final
functional review; detailed original decision-by-decision transcript not
reproduced here.

**Review status:** Functional baseline complete; technical feasibility,
integration contracts, and detailed test cases pending.

# 1. Product principles and boundaries

- 2D overhead, layer-aware editor with physical height and overlap
  awareness; no full 3D modeling requirement.

- Unified project structure supports one or more independent horizontal
  display levels.

- Preserve user control: substitutions, version promotion, conflicts and
  geometry-affecting conversions require explicit decisions.

- Separate reusable designs, their instances, unique physical
  assemblies, transport units, and actual inventory.

- Existing generic systems should be reused instead of creating
  specialized subsystems for each exhibition scenario.

- Cloud-provider choice and local offline work are core requirements,
  not optional export conveniences.

- All approved requirements remain in scope; phase allocation is
  delivery order, not deletion.

# 2. Requirement conventions

IDs are stable for this specification. Priority: Core = essential for a
usable initial editor; Planned = approved capability for subsequent
phases. Phase numbers are proposed and subject to technical dependency
review. Acceptance criteria are concise validation statements, not
exhaustive test scripts.

P1 Core Layout; P2 Advanced Design; P3 Catalog/Inventory; P4 Physical
Assemblies/Versions; P5 Exhibitions/Transport; P6 Setup/Collaboration;
P7 Advanced Operations. Foundational security, backups, stable IDs and
storage must begin in P1 even if their complete UI is delivered later.

# FR-01 — Projects, MILS and navigation

**FR-01.01** Create, duplicate, rename, organize and switch among
multiple independent display projects. *\[P1\]*

> **Acceptance:** Projects persist independently and reopen with their
> saved settings.

**FR-01.02** Support 32x32, 32x16 and 16x16 MILS plus configurable
custom sizes. *\[P1\]*

> **Acceptance:** Standard and custom modules align to the stud grid.

**FR-01.03** Assign unique MILS identifiers automatically, with manual
override and validation. *\[P1\]*

> **Acceptance:** Identifiers remain stable after save/reopen.

**FR-01.04** Support flexible display footprints, temporary construction
areas and overhang warnings. *\[P1\]*

> **Acceptance:** Out-of-bounds placements warn without silently
> deleting objects.

**FR-01.05** Provide rulers, stud/plate measurements, inch/cm conversion
and saved dimensions. *\[P1\]*

> **Acceptance:** Measurements match model coordinates and selected
> units.

**FR-01.06** Provide reusable project templates and default settings.
*\[P2\]*

> **Acceptance:** New project can start from a saved template.

**FR-01.07** Provide searchable, collapsible Project Explorer with
jump-to-canvas, visibility, locks and saved views. *\[P2\]*

> **Acceptance:** Selecting an Explorer item locates the corresponding
> object.

# FR-02 — Multi-level display support

**FR-02.01** Each project contains one or more independent physical
display levels; a new project starts with one. *\[P1\]*

> **Acceptance:** Additional levels can be added without converting or
> splitting the project.

**FR-02.02** Each level has its own MILS layout, support width/depth,
elevation above floor and horizontal position. *\[P1\]*

> **Acceptance:** Level settings are editable and persist.

**FR-02.03** Provide per-level editing/visibility and combined overhead
overview showing alignment. *\[P1\]*

> **Acceptance:** Overlapping levels remain distinguishable and
> individually editable.

**FR-02.04** Apply boundary and overhang checks separately to each
level. *\[P1\]*

> **Acceptance:** Warnings reference the owning support surface.

**FR-02.05** Each assembly has one owning level; its height/footprint
can trigger cross-level clearance warnings. *\[P2\]*

> **Acceptance:** Assembly spanning into another level warns about
> collisions without multi-level ownership.

**FR-02.06** Retain project-wide inventory, versions, exhibitions and
backups across all levels. *\[P1\]*

> **Acceptance:** Adding levels does not duplicate global records.

# FR-03 — 2D editor and object placement

**FR-03.01** 2D overhead canvas with pan, zoom, adaptive detail and
stud-level placement. *\[P1\]*

> **Acceptance:** Large display can be navigated and objects placed
> precisely.

**FR-03.02** Snapping modes: full stud, half stud, known connection
points and free placement. *\[P2\]*

> **Acceptance:** Chosen snapping mode affects positioning predictably.

**FR-03.03** Numeric coordinates, rotation and manual height overrides.
*\[P2\]*

> **Acceptance:** Entered transformations survive save/reopen.

**FR-03.04** Draw using repeated brush, straight start/end lines,
freehand and editable controlled curves. *\[P2\]*

> **Acceptance:** Stroke creates editable placed elements.

**FR-03.05** Pattern stamping and continuous brushes with spacing,
rotation and collision policies; one undo per stroke. *\[P2\]*

> **Acceptance:** Undo reverses a complete stroke and previews
> conflicts.

**FR-03.06** Support temporary/persistent named groups, nesting,
duplication within/between projects and independent/linked copies.
*\[P2\]*

> **Acceptance:** Copy identities and linkage modes are maintained.

**FR-03.07** Preserve accurate geometry and connection data when known,
simplified shapes otherwise, with acknowledged intentional overlaps.
*\[P2\]*

> **Acceptance:** Unknown geometry is clearly distinguished from exact
> geometry.

**FR-03.08** MILS movement within a transport unit prompts move-unit,
detach or cancel. *\[P5\]*

> **Acceptance:** Movement does not silently invalidate transport
> membership.

# FR-04 — Physical heights, terrain and moving features

**FR-04.01** Automatic stacking with manual overrides, active
construction height and stack inspector. *\[P2\]*

> **Acceptance:** Stack order and elevation can be inspected and edited.

**FR-04.02** Height filtering, cross-level physical clearance and
advisory overlap warnings. *\[P2\]*

> **Acceptance:** Conflicts can be reviewed and explicitly acknowledged.

**FR-04.03** Simplified terrain elevation volumes and detailed LEGO
terrain pieces; simplified volumes excluded from inventory. *\[P2\]*

> **Acceptance:** Only detailed parts contribute to part quantities.

**FR-04.04** Stairs support landings, continuous turns, editable step
heights and elevation in plate units. *\[P2\]*

> **Acceptance:** Step path and elevations remain editable.

**FR-04.05** Moving attractions have operating clearance zones, optional
height constraints, notes and warnings; no motion simulation. *\[P2\]*

> **Acceptance:** Operating zones appear in collision review.

**FR-04.06** Removable terrain sections store insertion direction,
clearance, attachment points and setup documentation. *\[P4\]*

> **Acceptance:** Removal and installation information follows the
> section.

# FR-05 — Reusable designs and physical assemblies

**FR-05.01** Maintain reusable assembly designs separately from physical
assemblies and canvas instances. *\[P2/P4\]*

> **Acceptance:** One design may have multiple instances and physical
> copies.

**FR-05.02** Each physical assembly has unique permanent ID, storage,
condition, repair history, photos and exhibition assignments. *\[P4\]*

> **Acceptance:** Physical records are independently identifiable.

**FR-05.03** Multiple physical copies may reference the same design
version but retain independent inventory/transport records. *\[P4\]*

> **Acceptance:** Updates to one physical copy do not change another.

**FR-05.04** Record physical-copy deviations using notes, photos,
approved substitutions and inventory adjustments. *\[P4\]*

> **Acceptance:** Differences are documented without forcing new
> reusable versions.

**FR-05.05** Shared setup instructions belong to design; copy-specific
instructions accompany selected physical copy. *\[P4/P6\]*

> **Acceptance:** Helper sees instructions for actual assigned copy.

**FR-05.06** Manual exhibition copy assignments and substitutions update
packing/transport; original issues and activity history remain. *\[P5\]*

> **Acceptance:** Final exhibition records show actual physical IDs.

**FR-05.07** Rebuild same physical object under same ID; distinct
replacement receives new ID. *\[P4\]*

> **Acceptance:** Historical references survive rebuilds and
> replacements.

**FR-05.08** Partial/permanent dismantling updates physical record and
installed/loose inventory manually, retaining history. *\[P4\]*

> **Acceptance:** Inventory movements do not erase historical design
> records.

**FR-05.09** Support physical assembly build readiness, progress, notes,
milestones and photos over multiple sessions. *\[P4\]*

> **Acceptance:** Build status can be tracked without new physical ID.

# FR-06 — Versions, branches and configurations

**FR-06.01** Named versions and branches, visual comparisons and part
quantity differences. *\[P4\]*

> **Acceptance:** Differences between saved versions can be inspected.

**FR-06.02** Manually select preferred design version; older versions
remain viewable, copyable and reusable. *\[P4\]*

> **Acceptance:** Preferred selection does not delete old versions.

**FR-06.03** Linked design instances offer explicit update or
independent copy choices; no automatic physical upgrades. *\[P4\]*

> **Acceptance:** User chooses whether linked instances change.

**FR-06.04** Saved exhibition configurations reference selected
design/physical assemblies and preserve show history. *\[P5\]*

> **Acceptance:** Historical exhibitions remain associated with versions
> used.

**FR-06.05** Design/version changes after packing require manual review
of assignments and lists. *\[P5\]*

> **Acceptance:** Previously prepared show plans are not silently
> rewritten.

**FR-06.06** No selective branch merge, automatic version promotion, or
separate legacy-version archive required. *\[P4\]*

> **Acceptance:** These workflows are not treated as prerequisites.

# FR-07 — Parts catalog and compatible manufacturers

**FR-07.01** BrickLink is preferred reference catalog for LEGO
identifiers, colors and images where permitted. *\[P3\]*

> **Acceptance:** Catalog search retains source identifiers and
> attribution.

**FR-07.02** Support genuine LEGO, Brickwith and mixed sourcing per
project with individual part/list overrides. *\[P3\]*

> **Acceptance:** Different projects can apply different sourcing
> defaults.

**FR-07.03** Brickwith-preferred sourcing uses approved equivalents
where available, with BrickLink fallback for remainder. *\[P3\]*

> **Acceptance:** Unmatched items remain visible for fallback purchase.

**FR-07.04** Reusable LEGO/BrickLink-to-Brickwith cross-reference
mappings via CSV and manual entry. *\[P3\]*

> **Acceptance:** Mapping can be reused across projects.

**FR-07.05** Every suggested substitution requires approval and
preserves original design part. *\[P3\]*

> **Acceptance:** Design and purchased equivalent remain traceable.

**FR-07.06** Track manufacturer, reference catalog, supplier, supplier
part ID and actual cost as distinct fields. *\[P3\]*

> **Acceptance:** Supplier changes do not overwrite design identity.

**FR-07.07** Offline cache of used, favorite and recent parts; online
full-catalog lookup when available. *\[P3\]*

> **Acceptance:** Previously used parts remain accessible offline.

# FR-08 — Inventory, purchasing and financial tracking

**FR-08.01** Track loose, reserved, installed, needed and on-order
quantities without double counting. *\[P3\]*

> **Acceptance:** A part cannot be simultaneously available and
> installed.

**FR-08.02** Manual and CSV imports; inventory adjustments with
traceability. *\[P3\]*

> **Acceptance:** Imported stock can be reconciled.

**FR-08.03** Consolidated shopping lists across projects and
configurations, with supplier comparisons. *\[P3\]*

> **Acceptance:** Demand is aggregated without duplicate reservations.

**FR-08.04** Purchase orders, supplier CSV I/O, partial deliveries,
order history and supplier mappings. *\[P3\]*

> **Acceptance:** Partial receipt updates outstanding quantities.

**FR-08.05** Estimated vs actual costs, budgets, purchase history and
reports. *\[P3/P7\]*

> **Acceptance:** Budget and actuals are separately visible.

**FR-08.06** Physical rebuilds identify reused, missing and leftover
parts via comparisons and manual stock changes. *\[P4\]*

> **Acceptance:** Installed-to-loose transitions reconcile quantities.

**FR-08.07** Non-LEGO accessories and consumables tracked for equipment,
storage, packing and quantities. *\[P5\]*

> **Acceptance:** Accessory packing uses actual quantities and
> locations.

# FR-09 — Exhibitions and venue planning

**FR-09.01** Exhibition calendar, multi-project participation and
scheduling conflict warnings. *\[P5\]*

> **Acceptance:** Overlapping physical assembly commitments can be
> flagged.

**FR-09.02** Saved configurations for full or partial displays, with
default equipment and show-specific overrides. *\[P5\]*

> **Acceptance:** Packing reflects selected configuration.

**FR-09.03** Scaled 2D venue plans for tables, shelves, aisles,
barriers, power, notes and staging. *\[P5\]*

> **Acceptance:** Venue placement is dimensionally consistent.

**FR-09.04** Track venue restrictions, travel notes, costs,
sponsorships, publicity and historical show records via existing fields.
*\[P5/P7\]*

> **Acceptance:** Exhibition notes and reports preserve relevant
> information.

**FR-09.05** Physical shelves, frames, brackets and supports are
reusable non-LEGO equipment/groups, not a new subsystem. *\[P5\]*

> **Acceptance:** Shelving appears on packing and setup lists.

**FR-09.06** Manual last-minute omissions, replacements, damage and
configuration changes preserve design versions. *\[P5\]*

> **Acceptance:** Exhibition plan changes do not rewrite source design.

**FR-09.07** Exhibition history retains actual assignments, setup
timing, helper activity, photos, issues and improvements. *\[P7\]*

> **Acceptance:** Past shows can be reviewed and compared.

# FR-10 — Transport, storage and packing

**FR-10.01** Explicit transport units, boxes and physical items with
stable IDs and packing assignments. *\[P5\]*

> **Acceptance:** Packing list identifies exact physical items.

**FR-10.02** Nested boxes, shared boxes, dimensions, manually entered
weights, storage locations and condition notes. *\[P5\]*

> **Acceptance:** Container hierarchy and physical measurements persist.

**FR-10.03** Vehicle loading plans with boxes assigned to vehicle/trip
and overlap warnings. *\[P5\]*

> **Acceptance:** Load plan can be saved and printed.

**FR-10.04** Packing, loading, unloading and reconciliation checklists;
QR codes perform lookup only. *\[P5/P6\]*

> **Acceptance:** QR lookup does not silently mark an item complete.

**FR-10.05** Level-based grouping/filtering while allowing mixed-level
boxes and transport units. *\[P5\]*

> **Acceptance:** One box can hold modules from multiple display levels.

**FR-10.06** Packing labels, photos, handling notes, instructions and
manual verification. *\[P5\]*

> **Acceptance:** Handlers can identify contents and special
> precautions.

**FR-10.07** Permanent box identifiers not reused after retirement;
maintain activity history and issue records. *\[P5/P7\]*

> **Acceptance:** Retired IDs remain reserved and searchable
> historically.

# FR-11 — Setup, teardown and helpers

**FR-11.01** Setup layers for MILS, removable small elements and custom
moves; exclude fixed transported elements. *\[P6\]*

> **Acceptance:** Checklist does not require reinstalling permanent
> items.

**FR-11.02** Required/preferred task dependencies with override and
audit trail. *\[P6\]*

> **Acceptance:** User can override with documented reason.

**FR-11.03** Helper tasks may be open, assigned or claimed, with
completion, reassignment and reopening. *\[P6\]*

> **Acceptance:** Multiple helpers can coordinate progress.

**FR-11.04** Flexible multi-level setup/teardown sequence based on tasks
and dependencies, not fixed shelf order. *\[P6\]*

> **Acceptance:** Tasks may alternate between physical levels.

**FR-11.05** Section-based setup guides, photographs, print center and
individual/grouped MILS printouts. *\[P6\]*

> **Acceptance:** Guide matches selected exhibition configuration.

**FR-11.06** Offline shared helper sessions with later synchronization
and conflict review. *\[P6\]*

> **Acceptance:** Offline completions are retained and reconciled.

**FR-11.07** Setup/teardown timing, issues, emergency changes and repair
notes preserved in exhibition history. *\[P6/P7\]*

> **Acceptance:** Actual work is auditable after the event.

# FR-12 — Documentation, repairs and history

**FR-12.01** Central photo library and notes linked optionally to
project, level, MILS, assembly, issue, box or task. *\[P4/P7\]*

> **Acceptance:** Same document can be found from relevant contexts.

**FR-12.02** Level filtering without separate per-level repositories.
*\[P2/P7\]*

> **Acceptance:** Level filter returns associated records.

**FR-12.03** Assembly-specific notes, photos, height/layer references
and printable documentation. *\[P4\]*

> **Acceptance:** Documentation follows assembly and its version.

**FR-12.04** Persistent issues and repair records with condition,
photos, parts, status and history. *\[P4/P7\]*

> **Acceptance:** Unresolved repairs remain visible between exhibitions.

**FR-12.05** Activity and exhibition history, comparisons, recurring
issues and improvement notes. *\[P7\]*

> **Acceptance:** History can be viewed without altering current
> records.

**FR-12.06** Shared read-only interactive project access with
invited/unlisted/public options and revocable links. *\[P7\]*

> **Acceptance:** Read-only recipients cannot edit project data.

# FR-13 — System, storage, sync and security

**FR-13.01** User-selected primary cloud provider: OneDrive, Dropbox,
Google Drive; extensible to others. *\[P1/P7\]*

> **Acceptance:** Project can be stored in a selected supported
> provider.

**FR-13.02** Local working copies support offline project editing and
queued synchronization. *\[P1/P6\]*

> **Acceptance:** Offline edits persist and sync when reconnected.

**FR-13.03** Conflict detection and explicit user review; no silent
overwrites. *\[P1/P6\]*

> **Acceptance:** Conflicting edits preserve recoverable versions.

**FR-13.04** Project and account backups, versioned archives, restore
preview and recovery snapshots. *\[P1/P7\]*

> **Acceptance:** Restore can be previewed before replacing data.

**FR-13.05** Stable identifiers, migration safety and explicit approval
for geometry-changing conversions. *\[P1/P7\]*

> **Acceptance:** Upgrade retains IDs and offers recovery for risky
> changes.

**FR-13.06** Adaptive rendering, selective loading and background
processing for large projects. *\[P1/P2\]*

> **Acceptance:** Large projects remain usable under defined performance
> tests.

**FR-13.07** Data portability and provider migration preserving
references and attachments. *\[P7\]*

> **Acceptance:** Export/import round trip retains project integrity.

**FR-13.08** Role-based editing/permissions and safe offline
synchronization for helpers. *\[P6\]*

> **Acceptance:** Unauthorized changes are rejected and audited.

# FR-14 — Comprehensive integrated Help System

**FR-14.01** Searchable Help Center, context-sensitive help and tooltips
across application. *\[P1\]*

> **Acceptance:** User can find help from the relevant screen.

**FR-14.02** Getting-started tutorials and guided workflows for key
features. *\[P1-P7\]*

> **Acceptance:** Guidance follows the available feature set.

**FR-14.03** Illustrated examples and troubleshooting for imports,
sourcing, sync and common errors. *\[P3-P7\]*

> **Acceptance:** Known error paths have actionable help topics.

**FR-14.04** Essential help content accessible offline. *\[P1/P6\]*

> **Acceptance:** Core help opens without network access.

**FR-14.05** Help content version-aware and maintained alongside
features. *\[P1-P7\]*

> **Acceptance:** Instructions match released UI behavior.

**FR-14.06** Application help is distinct from display-specific
assembly/helper instructions, with links where useful. *\[P6\]*

> **Acceptance:** Users can navigate between product help and setup
> guides.

# 3. Seven-phase roadmap

**P1 — Core Layout Designer:** Local project files, storage abstraction
and initial cloud connection; projects/levels/MILS, basic 2D editing,
save/reopen, print/export, basic help and recovery foundation.

**P2 — Advanced Design Tools:** Geometry, stacking, terrain, stairs,
patterns, clearance, groups, reusable designs, performance refinements.

**P3 — Catalog, Inventory and Purchasing:** BrickLink/Brickwith
integration, mappings, substitution approvals, inventory, supplier CSV,
shopping lists, orders and cost tracking.

**P4 — Physical Assemblies and Versions:** Physical IDs, copies,
conditions, rebuilds, version history, preferred versions, documentation
and inventory linkage.

**P5 — Exhibitions and Transportation:** Configurations, venue layouts,
equipment groups, shelves, boxes, vehicle plans, packing and scheduling.

**P6 — Setup, Teardown and Collaboration:** Tasks, dependencies, helper
guides, offline shared sessions, sync conflict resolution,
reconciliation.

**P7 — Advanced Operations and Reporting:** Historical analytics, full
backups/restore, provider migration, read-only sharing, advanced reports
and remaining approved refinements.

# 4. Cross-cutting architecture dependencies

- Define one canonical portable project format with stable object IDs
  and versioned migrations.

- Define provider adapter interfaces for authentication, files,
  revisions, quotas and sync; validate API access/licensing for each
  named provider.

- Define authoritative inventory transactions so design quantities,
  installed physical parts, reservations and purchases never
  double-count.

- Define physical coordinate systems: studs and plate heights within
  levels, level offsets in physical units, venue/table positioning.

- Define catalog identity separately from manufacturer, supplier, price
  and approved equivalents.

- Define permissions and conflict resolution for offline multi-helper
  sessions and simultaneous edits.

- Define measurable performance, accessibility, backup and data-loss
  acceptance thresholds before implementation.

# 5. Open technical validations (not new feature requests)

- BrickLink catalog/API permissions, attribution and practical data
  coverage.

- Brickwith cross-reference source format and available import/export
  data.

- OneDrive, Dropbox and Google Drive API support for chosen
  synchronization and revision strategy.

- Project file size, asset storage, offline browser limits and
  multi-device sync constraints.

- Performance benchmarks for target display sizes and expected
  concurrent helpers.

- Final phase-specific acceptance test matrix, security controls and
  backup recovery objectives.

# 6. Scope controls and exclusions

- No full 3D CAD requirement; maintain a 2D height-aware editor.

- No automatic substitutions, silent conflict overwrites, automatic
  physical assembly upgrades or automatic preferred-version promotion.

- No specialized weather, attraction motor control, safety, staging,
  legacy-version or physical-copy allocation subsystem where existing
  notes, issues, equipment and tasks suffice.

- No scan-triggered packing completion from QR labels.

- No requirement to write code or begin implementation at this planning
  stage.

# 7. Specification governance

This document is a consolidated working baseline, not a verbatim archive
of every earlier conversation. Requirement groups and acceptance
statements are derived from approved decisions; detailed technical
design, integration contracts and exhaustive test cases are future
deliverables. Changes should receive a unique change ID, rationale,
affected requirement IDs, and approval before altering scope.

Recommended next deliverables: (1) traceability audit against original
decision log; (2) data/entity model; (3) interface wireframes; (4)
provider integration feasibility; (5) phase-by-phase acceptance test
plan. No coding until those planning artifacts are approved.

# 8. Version 1.1 — Traceability audit and detailed refinements

This addendum preserves all 97 requirements in Version 1.0 and adds
separately testable details drawn from approved planning decisions.
These refinements do not introduce new product capabilities. Historical
decision references below are thematic references, not a claim of a
line-by-line audit of every conversation.

## 8.1 Document change control

| Version | Change                                                                  | Status                                          |
|---------|-------------------------------------------------------------------------|-------------------------------------------------|
| 1.0     | Original consolidated specification: 97 numbered requirements           | Retained unchanged                              |
| 1.1     | Traceability refinements, verification criteria and dependency register | Planning baseline; technical validation pending |

## 8.2 Detailed requirement refinements

Each TR item is an auditable refinement of an existing FR requirement.
Phase assignments are proposed and may be adjusted during technical
design.

**TR-01 Inventory ownership \[P3/P4\]**

Record loose parts as inventory holdings independently from
design-required quantities.

**Acceptance:** A design edit alone does not change physically owned
stock.

**Maps to:** FR-08.01, FR-05.02

**TR-02 Reservation accounting \[P3\]**

Reserve available loose quantities for a planned build without changing
physical ownership or installed counts.

**Acceptance:** Two simultaneous projects cannot reserve the same
quantity twice.

**Maps to:** FR-08.01

**TR-03 Installed inventory \[P3/P4\]**

Record installed quantities against a specific physical assembly ID, not
only its reusable design.

**Acceptance:** Two copies of one design show separate installed
quantities.

**Maps to:** FR-05.03, FR-08.01

**TR-04 Inventory transactions \[P3/P4\]**

Track manual movement among loose, reserved and installed states,
including reason and date.

**Acceptance:** A dismantle or rebuild produces a traceable quantity
adjustment.

**Maps to:** FR-08.02, FR-05.08

**TR-05 Purchasing reconciliation \[P3\]**

On partial delivery, increase received stock only for received
quantities and retain outstanding order balance.

**Acceptance:** Partially received purchase order remains open for
remaining quantities.

**Maps to:** FR-08.04

**TR-06 Substitution provenance \[P3\]**

Keep original design part, approved equivalent, actual manufacturer and
actual supplier separately.

**Acceptance:** Reversing an approved substitute restores original
reference without losing purchase history.

**Maps to:** FR-07.05, FR-07.06

**TR-07 Cross-reference approval \[P3\]**

Imported Brickwith equivalence mappings remain proposed until reviewed
and approved.

**Acceptance:** Unapproved imported mapping cannot silently replace a
design part.

**Maps to:** FR-07.04, FR-07.05

**TR-08 Assembly identity \[P4\]**

A rebuild of the same physical object retains its physical ID; a
separate replacement gets a new permanent ID.

**Acceptance:** Historical exhibition references continue to resolve
after rebuild.

**Maps to:** FR-05.07

**TR-09 Assembly version linkage \[P4\]**

Physical assemblies reference the actual design version built,
regardless of preferred-version changes.

**Acceptance:** Older physical copy remains assigned to its earlier
design version.

**Maps to:** FR-05.03, FR-06.02

**TR-10 Assembly retirement \[P4\]**

Retired or dismantled physical assemblies preserve ID, condition/history
and past exhibition references.

**Acceptance:** Retired assembly disappears from active packing choices
but remains in history.

**Maps to:** FR-05.08

**TR-11 Physical deviations \[P4\]**

Document physical-copy changes through existing notes, photos, approved
substitutions and inventory adjustments.

**Acceptance:** A copy-specific change does not automatically create a
new reusable design version.

**Maps to:** FR-05.04

**TR-12 Build readiness \[P4\]**

Track designed, partially built, built and repair-needed readiness using
existing milestones, tasks and issue records.

**Acceptance:** Incomplete assembly is identifiable before exhibition
preparation.

**Maps to:** FR-05.09

**TR-13 Configuration snapshots \[P5\]**

Preserve each exhibition’s actual selected project versions, physical
assemblies and equipment quantities.

**Acceptance:** Editing a later default does not rewrite a completed
exhibition.

**Maps to:** FR-06.04, FR-09.02

**TR-14 Shared physical equipment \[P5\]**

Reference one physical accessory or assembly across configurations
without duplicating stock.

**Acceptance:** Overlapping shows flag shared physical item conflict.

**Maps to:** FR-09.01, FR-09.02

**TR-15 Equipment group variations \[P5\]**

Support reusable equipment group variants (e.g., compact, standard,
full) through existing group membership and quantities.

**Acceptance:** Selecting a variant updates planned packing without
duplicating catalog items.

**Maps to:** FR-09.02, FR-08.07

**TR-16 Late exhibition changes \[P5\]**

When a display section is omitted or replaced, update show-specific
packing/setup and preserve source design version.

**Acceptance:** Show records identify actual display without mutating
reusable design.

**Maps to:** FR-09.06

**TR-17 Packing verification \[P5/P6\]**

Track packed, loaded, unloaded, installed and reconciled checklist
status separately where applicable.

**Acceptance:** Completing a packed task does not imply installation is
complete.

**Maps to:** FR-10.04, FR-11.01

**TR-18 Container hierarchy \[P5\]**

Boxes may contain other boxes and items from several levels, with unique
permanent IDs.

**Acceptance:** Nested item is counted once in packing inventory and is
traceable to outer box.

**Maps to:** FR-10.02, FR-10.05

**TR-19 Box movement history \[P5/P7\]**

Record box storage and show movement through existing activity history
and location updates.

**Acceptance:** User can determine current storage and last recorded
movement.

**Maps to:** FR-10.07

**TR-20 Labels and QR \[P5\]**

Generate printable box labels and QR lookup that never auto-confirms
packing or receipt.

**Acceptance:** Scanning opens lookup but checklist state remains
unchanged.

**Maps to:** FR-10.04, FR-10.06

**TR-21 Vehicle/trip planning \[P5\]**

Associate boxes and transport units with specific vehicle/trip and show
placement warnings.

**Acceptance:** An item assigned to a second trip appears on that trip’s
load plan.

**Maps to:** FR-10.03

**TR-22 Level-aware packing \[P5\]**

Filter/group packing by owning display level without forbidding
mixed-level boxes.

**Acceptance:** A shared box appears in correct total inventory without
double counting.

**Maps to:** FR-10.05

**TR-23 Dependency overrides \[P6\]**

Distinguish required and preferred setup dependencies; manual override
requires activity history.

**Acceptance:** Overridden required dependency remains visible in audit
trail.

**Maps to:** FR-11.02

**TR-24 Helper completion \[P6\]**

Helpers can claim, complete, reopen or reassign tasks according to
permissions without mandatory owner approval.

**Acceptance:** Activity history records actor and state transitions.

**Maps to:** FR-11.03

**TR-25 Cross-level sequence \[P6\]**

Tasks can alternate among levels and physical shelf setup without a
forced bottom-to-top order.

**Acceptance:** A cross-level required dependency controls order
independent of level number.

**Maps to:** FR-11.04

**TR-26 Offline activity sync \[P6\]**

Queue offline checklist changes with user, task and local revision;
reconcile conflicts before overwriting.

**Acceptance:** Two contradictory offline task updates require explicit
conflict handling.

**Maps to:** FR-11.06, FR-13.03

**TR-27 Cloud provider authorization \[P1\]**

Provider connection uses authorized user access with revocation, clear
error handling and no embedded provider passwords.

**Acceptance:** Revoked provider access stops sync safely and preserves
local work.

**Maps to:** FR-13.01

**TR-28 Cloud revisions \[P1/P6\]**

Compare remote revision/version to last synced revision before replacing
cloud project data.

**Acceptance:** Divergent edits do not silently overwrite either copy.

**Maps to:** FR-13.03

**TR-29 Cloud offline recovery \[P1/P6\]**

Local edits remain accessible during connectivity/provider failure and
are queued for later sync.

**Acceptance:** Disconnect/reconnect cycle preserves edits and reports
sync state.

**Maps to:** FR-13.02

**TR-30 Backup independence \[P1/P7\]**

Keep recoverable versioned backups separate from ordinary working-file
synchronization.

**Acceptance:** A corrupted synchronized file can be restored from an
earlier archive after preview.

**Maps to:** FR-13.04

**TR-31 Provider migration \[P7\]**

Migration exports projects, attachments, stable IDs and cross-references
in a portable format.

**Acceptance:** Moved project opens with original physical IDs and asset
links intact.

**Maps to:** FR-13.07

**TR-32 Help context \[P1-P7\]**

Help links map to screen/tool identifiers and show content appropriate
to released functionality.

**Acceptance:** Opening help from a tool displays the relevant topic.

**Maps to:** FR-14.01, FR-14.05

**TR-33 Offline help \[P1/P6\]**

Bundle essential help topics with offline application resources.

**Acceptance:** Getting-started and core troubleshooting topics open
without network access.

**Maps to:** FR-14.04

**TR-34 Help maintenance \[P1-P7\]**

Add/update tutorials and troubleshooting alongside each feature release.

**Acceptance:** Release checklist verifies help topic coverage for
changed features.

**Maps to:** FR-14.02, FR-14.05

**TR-35 Documentation associations \[P4/P7\]**

Allow one photo or note to reference project, level, physical assembly,
MILS, box, issue or task as applicable.

**Acceptance:** Level filtering does not duplicate the underlying
document.

**Maps to:** FR-12.01, FR-12.02

**TR-36 Cross-level clearance \[P2\]**

Calculate assembly position from owning level elevation and detect
intersection with other support surfaces.

**Acceptance:** A tower penetrating an upper shelf triggers an advisory
warning.

**Maps to:** FR-02.05, FR-04.02

## 8.3 Cross-area traceability register

| Dependency                      | Existing groups | Refinements    | Verification focus                                             |
|---------------------------------|-----------------|----------------|----------------------------------------------------------------|
| Physical assemblies ↔ inventory | FR-05, FR-08    | TR-01 to TR-12 | Installed quantities per physical ID; no duplicate reservation |
| Exhibitions ↔ configurations    | FR-06, FR-09    | TR-13 to TR-16 | Actual show assignments and historical snapshots               |
| Transport ↔ storage             | FR-09, FR-10    | TR-17 to TR-22 | One physical item, multiple operational views                  |
| Setup ↔ offline helpers         | FR-11, FR-13    | TR-23 to TR-26 | Dependency audit and offline conflict handling                 |
| Cloud ↔ project integrity       | FR-13           | TR-27 to TR-31 | Provider-neutral data and recoverable revisions                |
| Help ↔ application releases     | FR-14           | TR-32 to TR-34 | Help content tracks delivered features                         |
| Documentation ↔ display levels  | FR-02, FR-12    | TR-35 to TR-36 | Level association and clearance consistency                    |

## 8.4 Outstanding engineering validations

- Confirm BrickLink catalog/API licensing, attribution, availability and
  permitted caching before selecting an integration method.

- Confirm Brickwith catalog, CSV formats and manufacturer-equivalence
  data; manual mapping must remain available.

- Validate OneDrive, Dropbox and Google Drive authorization, revision
  APIs, rate limits, quota handling and file-lock semantics.

- Choose canonical project schema, identity model and atomic inventory
  transaction rules before implementing cross-device synchronization.

- Define measurable targets for largest supported layouts, offline asset
  storage, recovery time and simultaneous helper sessions.

- Complete source-by-source historical decision audit if a fully
  exhaustive one-to-one traceability claim is required.

## 8.5 Phase gate recommendations

- **P1:** Project can be created, edited offline, saved, reopened and
  synchronized with conflict-safe provider handling; basic help works
  offline.

- **P2:** Detailed geometry, terrain, height and cross-level warnings
  operate correctly on a realistic multi-level project.

- **P3:** Design-to-purchase flow preserves source identity and
  reconciles partial deliveries without double-counting.

- **P4:** Physical copies, rebuilds, retirement and version history
  retain identity and inventory integrity.

- **P5:** Exhibition configurations generate consistent equipment, box
  and vehicle packing views.

- **P6:** Helpers complete setup/teardown offline, with conflicts
  reviewed and activity preserved.

- **P7:** Provider migration, restore, historical reporting and sharing
  are verified against preserved records.

## 8.6 Audit status and limitations

Status: Detailed refinement pass completed against the Version 1.0
specification and the approved planning decisions available in the
project context. The original 97 requirements remain intact, and 36
supplemental traceable refinements have been added. This is not a
certified exhaustive comparison against a complete export of every
historical message. Technical feasibility and measurable thresholds
remain open engineering work.
