# Milestone 2A — Heights: progress report

**Date:** 31 Oct 2026 · First part of Phase 2 (advanced design).

Everything here is **hidden until switched on**, with **⋯ (More tools) → Heights**, per project (owner rule: the app must feel basic).

## What was delivered

- **Heights:**
  - every module, feature, marker, small item and piece has a height in plates (1 plate = 3.2 mm, 1 brick = 3 plates);
  - type it as plates (`24`), bricks (`8 bricks`) or inches/cm (`10 in`);
  - sensible defaults: bricks 3, plates and tiles 1, markers 3 (flower pot 1), modules 0, so heights count from the top of the plates;
  - shown as e.g. "95 plates (12.0 in)".
- **Automatic stacking** (FR-04.01): things are stacked in drawing order (layers bottom to top), and each sits on the highest thing under it. "Set where it sits by hand" overrides that.
- **Stack view:** the details panel shows where the selected thing sits, what it rests on, its top height, and everything stacked at that spot from bottom to top (click one to select it).
- **Height filter** (FR-04.02): "Show up to" in the status bar hides things sitting at or above a height, so you can see and work on what's underneath. Clicks go through to what's visible.
- **Shelf clearance** (FR-02.05, TR-36):
  - with more than one level, something on a lower level tall enough to reach a higher level's surface above it gets a warning, e.g. "Ferris Wheel (14.0 in tall) reaches Upper shelf, which is 12.0 in above";
  - it uses each level's height above the floor and its overview offset;
  - it can be marked "Intended".
- **Printout:** a Height column for features, and "sits at → top" for markers, items and pieces.
- **Help:** a new "Heights and stacking" topic.

## Changes made along the way

- **Single pieces stack freely:** a brick on a plate no longer gives an overlap warning. Two markers or small items in the same spot still do.
- **Toolbar fits on one line at 1280 px.** "Snap: stud" is now one dropdown, and the save time shows "Saved 2:41 PM" for today or "Saved Oct 30" otherwise (hover for the full time).
- **Pop-up menus stay inside the window.** The new options menu opened off-screen when the toolbar wrapped.
- **Accessibility:** detail fields and the Level and Snap pickers now have proper names (screen readers read the label, not the hint).

## Tests

- Unit: 9 new tests:
  - units and parsing;
  - stacking: brick on plate on module, dropping back when moved off, hand-set height and base, a tall feature;
  - the stack view;
  - shelf clearance (warns, fits, shelf elsewhere, heights off);
  - pieces stacking without warnings.
- Browser: 3 new tests:
  - Heights is hidden until switched on;
  - a 12 in ride height, a brick stacked on a plate, the stack view, and the filter letting a click reach the plate;
  - a tall ride under a new shelf triggers the clearance warning.
- Totals: **108 unit, 50 browser**, all passing.

## Next in Phase 2

Drawing tools (brush and lines for rows of trees or fences, one undo per stroke), then terrain and stairs, clearance zones for moving rides, and nested groups / reusable designs.
