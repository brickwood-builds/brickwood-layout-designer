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
