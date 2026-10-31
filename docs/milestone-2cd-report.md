# Milestones 2C and 2D — Clearance zones and reusable designs: progress report

**Date:** 31 Oct 2026 · Phase 2, in the order the owner chose (before terrain).

## 2C — Operating zones (FR-04.05)

- Any feature (ride, building) can have an **operating zone**: "studs all around" in its details. It's drawn as a dashed orange outline, which moves with the ride while dragging.
- **Anything placed in the zone gets a warning**, e.g. "Lamp is inside the operating zone of Swings" (a marker, item, piece or another feature). It can be marked Intended.
  - Not counted: the plain plates under the zone, and things built on the ride itself.
- **With Heights on**, "things lower than this may sit in the zone", e.g. tiles under swing seats.
- **Printout:** a Zone column for features.

## 2D — Reusable designs (FR-05.01, FR-06.03)

- **Save as design…** (selection actions): the selection, plus what sits on it, goes into the palette under **Designs** and becomes the first copy. MILS plates are left out, because they're physical plates with their own IDs.
- **Placing copies:** tap a design to place a copy in free space, or drag it to an exact spot. Each copy is a group linked to the design.
- **Linked copies are never changed silently.** "Update the design from this copy" makes a new version. Every other copy then says "the design has changed" and offers **Update this copy** (replaced in place, one Undo) or **Keep as is** (unlinked). The palette shows a badge with how many copies haven't been updated.
- Removing a design leaves its copies as ordinary groups.

## Also in this batch (owner request)

- **Real parts:** about 60 common plates, tiles, bricks and rounds are built in, with BrickLink numbers, and searchable in Single pieces. Tiles are smooth. "New piece…" has "Smooth top (tile)". The full parts catalog is written into `docs/roadmap.md` for Phase 3.

## Bugs found by the tests and fixed

- **Placing a design copy also duplicated the original's group,** which gave two groups with the same members, so the panel showed the wrong one.
- **Tapping a design placed the copy on top of the original.** It now goes into free space.

## Tests

- Unit: 6 zone tests, 6 design tests, 5 parts tests.
- Browser: 3 new tests:
  - a lamp in the Swings zone warns;
  - the full design flow: save, place a copy, change the design, see the badge, update the copy;
  - parts search plus a smooth custom tile.
- Totals: **130 unit, 56 browser**, all passing.
