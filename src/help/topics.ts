// Built-in help. Bundled with the app, so it works offline (TR-33).
// Keep in step with features: each release checks these topics (TR-34).

export interface HelpTopic {
  id: string;
  title: string;
  /** Paragraphs; lines starting with "• " are bullets. */
  body: string[];
}

/** Which topic opens first from each screen or tool (TR-32). */
export const HELP_CONTEXT = {
  dashboard: 'getting-started',
  editor: 'editor-basics',
  measure: 'measure',
  draw: 'draw',
  print: 'print',
} as const;

export type HelpContext = keyof typeof HELP_CONTEXT;

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    body: [
      'Brickwood Layout Designer draws your display from above: the table, the MILS modules, rides and buildings, and small items — like the Visio drawings, but to exact stud scale.',
      'The two Brickwood displays are already here as starter projects. Choose Open on a card to edit it, or New project to start from an empty table or a copy of a starter.',
      'Everything saves automatically in this browser. Use More → Export file now and then to keep a backup you can copy to another computer or the iPad.',
    ],
  },
  {
    id: 'editor-basics',
    title: 'Adding and moving modules',
    body: [
      '• Add: tap a size in the left column (it goes in a free spot near the middle of the view), or drag it onto the table. 8×16 is a 16×8 plate standing upright (it gets an A-xx ID).',
      '• Studs: zoom in and the studs appear on the plates, so you can place things exactly; everything snaps to whole studs.',
      '• Select: click or tap. Shift-click adds to the selection. With a mouse, drag a box on empty space to select everything it touches.',
      '• Move: drag. Everything selected moves together and snaps to whole studs (change this with Snap). A red outline while dragging means it would overlap something or hang off the table — you can still drop it.',
      '• Rotate: R (or the Rotate buttons). Several modules rotate together as one block.',
      '• Delete: Delete key or the Delete button. Undo with Ctrl+Z (⌘Z on a Mac) or ↶.',
      '• Details: the right-hand panel shows the selected module’s ID, name, size, position and notes. Type a new value and press Enter.',
      '• Zoom: mouse wheel or the − / Fit / + buttons. Pan: Pan mode, hold Space and drag, or the middle mouse button.',
    ],
  },
  {
    id: 'ipad',
    title: 'Using it on the iPad',
    body: [
      '• Tap to select; tap empty space to clear the selection.',
      '• Drag a module with one finger to move it.',
      '• Drag empty space with one finger to move around; pinch with two fingers to zoom.',
      '• Drag from the left column onto the table to place something exactly; a tap adds it near the middle.',
      '• The details panel floats at the bottom right when something is selected.',
      'Changes save as you go and again whenever you switch away from the app.',
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    body: [
      '• Arrow keys: nudge 1 stud · Shift+arrow: 10 studs',
      '• R / Shift+R: rotate right / left',
      '• Delete or Backspace: delete',
      '• Ctrl+Z: undo · Ctrl+Shift+Z or Ctrl+Y: redo',
      '• Ctrl+A: select all on this level · Escape: clear selection',
      '• Ctrl+D: duplicate · Ctrl+C / Ctrl+V: copy / paste',
      '• Ctrl+G: group · Ctrl+Shift+G: ungroup · Alt-click: pick one piece of a group',
      '• V: select · H: pan (or hold Space) · M: measure · B: draw',
      '• F: fit the table in view · + / −: zoom',
      '• ?: this help',
      'On a Mac use ⌘ instead of Ctrl.',
    ],
  },
  {
    id: 'module-ids',
    title: 'MILS IDs',
    body: [
      'The ID is what’s written on the back of the plate: A-xx for 16×8, B-xx for 16×16, C-xx for 32×32 (Village modules use B01-V style).',
      'A new module gets the next free number automatically. Two modules can’t share an ID, and retired IDs (like B-24 to B-27) are never handed out again.',
      'Plates that exist but aren’t in this layout keep their IDs too, so a new plate never takes the number of one in storage. Deleting a module from the layout keeps its ID reserved. Typing that ID onto a module puts the plate back.',
      'Features built directly on their own base (like the Ferris Wheel or the Tavern) don’t need an ID; leave it blank and the name is shown instead.',
    ],
  },
  {
    id: 'items',
    title: 'Features, markers, small items and pieces',
    body: [
      '• Features: rides, buildings and anything else built on its own base. New… asks for a name and size; it acts like a module with a name instead of an ID, and rides can have their power in volts.',
      '• Operating zone: for a moving ride, set “Operating zone (studs all around)” in its details. A dashed orange outline shows the space it needs, and anything placed in it gets a warning (mark it Intended if it’s fine). With Heights on, low things such as tiles under swing seats can be allowed.',
      '• Setup markers: the coloured placeholder bricks that show helpers where things go. Each project has its own list: + New marker… adds one (name, size, round or square, LEGO colour) and keeps it in the list. The Adventure Park project comes with its nine markers.',
      '• Small items: your street lights, bushes, benches and so on. + New item… adds one to this project’s list.',
      '• Single pieces: actual LEGO pieces — bricks, plates, tiles. A few common ones are there; + New piece… adds any other size.',
      'Markers, items and pieces sit on top of modules and can cross module edges; the details panel says which modules they’re on. When you move, rotate or copy a module or feature, whatever sits on it (by its centre) comes along. Lock a layer if you want its things to stay put.',
      'Select any of them and choose Add to palette to reuse its size and colour. Colours are real LEGO colours only.',
    ],
  },
  {
    id: 'groups',
    title: 'Groups',
    body: [
      'Select several things and choose Group (Ctrl+G). Clicking any member then picks up the whole group, so it moves, rotates and copies as one.',
      'To work on one piece, Alt-click it or pick it from the chips in the group panel. Ungroup with Ctrl+Shift+G or the Ungroup button.',
    ],
  },
  {
    id: 'warnings',
    title: 'Warnings',
    body: [
      'The status bar counts problems on this level: modules or rides that overlap, anything hanging off the table, and duplicate or retired IDs. Click the count to see the list; click a warning to find it.',
      'Warnings never change or delete anything. If an overlap or overhang is on purpose, choose Intended: it stops counting but stays recorded with the date, and can be undone from “Show … marked as intended”.',
      'ID problems can’t be marked intended — give the module a different ID instead.',
    ],
  },
  {
    id: 'levels',
    title: 'Tables and levels',
    body: [
      'Table… sets the table’s name and size in inches; overhang warnings use it.',
      'Table… → Add a level… adds another surface — for example a shelf above the main table — with its own table size and height above the floor. Switch levels with the Level picker. Tick Others to see the other levels faintly for lining things up.',
      'A level can be deleted once it’s empty.',
    ],
  },
  {
    id: 'layers',
    title: 'Layers',
    body: [
      'Layers stack like the real build: plates at the bottom, then Surface details (sidewalks, roads, grass), then Markers & small items on top. ▲ ▼ change the order.',
      'The New items circle picks the layer new markers and items go on — for example choose Surface details while drawing sidewalks.',
      'Hide or lock any layer. For example, lock the plates while placing markers so they can’t be moved by accident.',
      'MILS IDs & names can be hidden like a layer, and Finished look shows each plate in its real LEGO colour (set it in the plate’s details; plates without one show as Green) — together they show what the finished display looks like.',
      'Select something and choose Move here to put it on another layer. Add layers with + Add layer; empty layers can be deleted. Things on a plate move with the plate, whatever layer they’re on.',
    ],
  },
  {
    id: 'measure',
    title: 'Measuring',
    body: [
      'The rulers along the top and left show distance from the back-left corner of the table in the chosen units (change Units in the status bar).',
      'Choose Measure (M) and drag between two points; hold Shift for a straight line. The length shows on the canvas and in the panel. Keep this dimension saves it (with an optional label) so it shows on the plan and the printout.',
    ],
  },
  {
    id: 'print',
    title: 'Printing and pictures',
    body: [
      'Print… opens a printable plan: the overhead drawing with IDs and ride names, then lists of modules (with positions from the back-left corner of the table), rides with power, markers and saved dimensions.',
      'Print / Save PDF uses the browser’s print dialog — choose “Save as PDF” to make a file. Download picture saves a PNG; Download drawing saves an SVG that stays sharp at any size.',
    ],
  },
  {
    id: 'backups',
    title: 'Saving, backups and recovery',
    body: [
      'There is no Save button to remember: every change is saved automatically within about a second. The toolbar shows “Saved” with the time, “Saving…” or “Not saved”. To keep a project in OneDrive as well, see Saving to OneDrive.',
      'The browser can clear its storage (for example after “clear website data”), so export important projects: on the project list choose More → Export file. Import… brings a file back; if the project already exists it’s imported as a copy and nothing is overwritten.',
      'Checkpoints are snapshots taken automatically every 10 minutes while you work and before a restore. More → Checkpoints… lets you preview one and restore it; the current version is kept as a checkpoint first.',
    ],
  },
  {
    id: 'onedrive',
    title: 'Saving to OneDrive (or any folder)',
    body: [
      'In Chrome or Edge on a computer, Save to a file… (bottom of the editor) lets you pick a file — put it in your OneDrive folder. From then on every save also goes to that file, and the OneDrive app copies it to the cloud. The bottom bar shows ✓ and the file name while it’s working.',
      'On another computer, choose Open file… on the project list and pick the same file in the OneDrive folder. It opens there and keeps saving to the same file.',
      'If the file was changed on another computer since this one last saved it, nothing is overwritten: you choose Use the file’s version or Keep this version, and the one you don’t pick is kept as a checkpoint.',
      'After restarting the browser it may show Resume saving to …: click it and allow access.',
      'Tip: let OneDrive finish syncing before you open the project on another computer, and avoid editing the same project on two computers at once.',
    ],
  },
  {
    id: 'draw',
    title: 'Drawing walkways and rows',
    body: [
      'Draw (B) paints pieces onto the table — for example a walkway of 1×1 round plates, a hedge or a row of lamps.',
      'In the panel pick what to draw with (any single piece, or this project’s own pieces, items and markers), a LEGO colour and the brush width in studs. Then drag: Freehand follows your finger or mouse, Straight draws a line from where you start to where you let go, Fill box fills a rectangle.',
      'One piece goes in each stud (or each piece-sized spot for bigger pieces), and painting over what’s already there doesn’t double it up. Each stroke is a single Undo.',
      'Where something is already there: Leave it (the default — a walkway is never doubled up) or Stack on top, to build a slope or hill layer by layer: paint a wide patch of plates, then a smaller patch on top, and so on. With Heights on, each layer sits one plate higher — tick Shade by height to see it.',
      'Curve: click (or tap) the points a curved walkway should pass through — the curve runs smoothly through every point. Finish with a double-click, Enter or Finish curve; Escape cancels. Dragging moves the view. The pieces become one group named “Curve of …”.',
      'To reshape a curve later: Select it, choose Edit curve, and drag its round handles — the pieces are laid again along the new shape (one Undo). Moving the curve keeps it editable; turning it makes it an ordinary group.',
      'Pattern stamping: set Spacing to place one every few studs instead of a solid line — a lamp every 8 studs along a walkway, or a tree every 6. Fill box makes a grid. Turn sets which way they face; Follow path turns them with the stroke. Red spots in the preview are already taken and are skipped. Each stroke is one Undo.',
      'To stamp a group of things (a bench with a lamp, a food stand), save it as a design first, then pick it in Draw with under Designs. Each stamp is a linked copy of the design.',
      'Tick Erase to remove things on the drawing layer under the brush instead.',
      'It draws on the layer chosen in Layers → New items (for walkways, Surface details is a good choice). Two fingers still move and zoom on the iPad.',
      'The printout counts identical pieces, e.g. “Plate Round 1×1, Tan × 412”.',
    ],
  },
  {
    id: 'parts',
    title: 'Finding real LEGO parts',
    body: [
      'Single pieces has the common plates, tiles and bricks ready to use. Type in its search box to look through about 2,400 real LEGO parts: plates, bricks, tiles, rounds, slopes, wedges, windows and doors, fences, rocks, plants and trees. Search by name and size (“tile 2x2”, “bush”, “slope 45”) or by part number (“3024”).',
      'Tap a part to place it, or drag it onto the table. It comes in at its real size, smooth if it is a tile, and with its height for Heights.',
      'Tap ☆ to keep a part in Favourites. Parts you place show under Recently used. Both stay on this device for every project, and also appear in Draw › Draw with.',
      'Select a placed part to see its part number. Its colour list shows the colours it has really been made in first.',
      'A few parts (some plants and animals) don’t have their size in the list: they come in as 1×1 — set their width and depth in the panel.',
      'Part numbers are Rebrickable’s; they are nearly always the same as BrickLink’s. The parts list comes from Rebrickable’s free downloads and works offline.',
    ],
  },
  {
    id: 'parts-list',
    title: 'Parts list and shopping list',
    body: [
      'Switch on Parts & inventory in the ⋯ menu. A Parts list… button appears at the bottom.',
      'The parts list shows every real LEGO part the layout uses, by part number and colour: how many it needs, how many you have, and how many to buy. Pieces you made yourself (no part number) and stairs aren’t counted.',
      'Have is your own parts — one list for all your projects, kept on this device. Type a number, or Import what I have… from a CSV with Part, Colour and Quantity columns (Rebrickable’s parts-list export works). Export what I have saves it as a CSV, as a backup or to move it to another device.',
      'Where to buy: tick Use Brickwith first, BrickLink for the rest to save money on a big display. Then tick Brickwith has it for each part Brickwith makes (remembered for all your projects, or Import Brickwith parts… from a CSV with Part, Colour and Price). Everything Brickwith doesn’t make stays on the BrickLink list. Leave it off for genuine LEGO only (official LEGO events). It’s set per layout; the layout itself always keeps the LEGO part.',
      'Costs: type a price each in the Each column, or set a usual price per piece for BrickLink and Brickwith to get an estimate before everything is priced (shown with ~). The estimate is split by supplier.',
      'Money spent: add what you paid (date, where, what, amount). It is saved with the layout and shown next to what is still to buy.',
      'BrickLink shopping list gives a CSV in Rebrickable’s format (part, colour, quantity). Import it on rebrickable.com (free account) to see prices and turn it into a BrickLink wanted list. Brickwith shopping list lists their part numbers, colours and quantities. Download parts list gives the whole table for Excel.',
    ],
  },
  {
    id: 'builds',
    title: 'Physical builds',
    body: [
      'Switch on Physical builds in the ⋯ menu. Then select a real build on the plan — the castle and what’s on it, a ride on its base — and choose Track as a physical build. It gets a permanent ID (PB-001, PB-002…).',
      'Its record keeps where it is stored, its condition, build progress (add steps and tick them off), photos, setup notes for this build, how it differs from its design, and a history of every change, note and repair.',
      'It changed: Rebuilt keeps the same ID (it’s the same build). Taken apart (partly or all) is recorded in its history. Replaced by a new build gives the new one a new ID; the old record stays with its history and points to the new one.',
      'Builds… at the bottom lists them all. Show on plan selects the build on the layout. Builds travel with the project file; photos stay on the device they were added on.',
    ],
  },
  {
    id: 'stairs',
    title: 'Stairs',
    body: [
      'In Draw, choose Stairs. Click (or tap) where the stairs start at the bottom, then where they turn, then where they end at the top. Finish with a double-click, Enter or Finish stairs.',
      'Set the width, how deep each step is (studs), how much each step goes up (1 plate, 2 plates or 1 brick), the start height, and whether there’s a landing every few steps. Every turn gets a square landing.',
      'Stairs are laid in straight runs across or down the table, on whole studs. Each step is one rise higher than the last; turn on Heights (⋯ menu) to see and use those heights, and Shade by height to read them from above.',
      'To change stairs later: Select them. Change any setting in the panel, or choose Edit path and drag the round handles; the steps are laid again (one Undo).',
      'Stairs are a planning shape: the printout counts steps and landings, not the plates or bricks you’ll build them from.',
    ],
  },
  {
    id: 'designs',
    title: 'Reusable designs',
    body: [
      'Arrange something once — a food stand with its benches, lamps and bushes — then reuse it. Select it (things sitting on it come along) and choose Save as design…. It appears in the palette under Designs and the selection becomes the first copy.',
      'Tap a design to place a copy in free space, or drag it to an exact spot. Each copy is a group: click it to pick up the whole thing; Alt-click picks one piece.',
      'To change the design, edit any copy and choose Update the design from this copy. The other copies are not changed by themselves: each shows “the design has changed” with Update this copy or Keep as is, and the palette shows how many haven’t been updated.',
      'Unlink turns a copy into an ordinary group. Removing a design from the palette leaves its copies in place.',
      'MILS plates aren’t saved in designs — they’re physical plates with their own IDs. Features, markers, items and pieces are.',
    ],
  },
  {
    id: 'heights',
    title: 'Heights and stacking',
    body: [
      'Heights are switched off until you need them: ⋯ (top right) → Heights.',
      'Select anything and set its Height in the details panel. Type plates (24), bricks (8 bricks) or inches (10 in). Bricks, plates and tiles already know their height; modules count as 0, so heights are measured from the top of the plates.',
      'Things stack by themselves: a brick placed on a plate sits on top of it. The panel shows where it sits and what it’s on, and lists everything stacked at that spot — click one to select it. Tick “Set where it sits by hand” to override.',
      '“Show up to” in the bottom bar hides everything sitting at or above a height, so you can see and work on what’s underneath. Slide it all the way right to show everything.',
      'Shade by height colours everything by how high its top is — green low down, then tan and brown, grey-white at the top — so slopes and hills read like a relief map from above. The key shows the range in plates.',
      'With more than one level (a shelf above the table), something tall enough to reach the shelf above gets a warning. Set each level’s height above the floor in Table….',
    ],
  },
  {
    id: 'units',
    title: 'Scale and units',
    body: [
      'One stud is exactly 8 mm, so a 32×32 module is 10.08 in (25.6 cm) across. Positions are stored in studs; inches and centimetres are only for display.',
      'The old Visio drawings used 10 in per 32 studs, which drifts about 1.5 in over a long display. The app uses the exact size.',
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    body: [
      '• “This project was changed in another tab”: the same project is open twice. Choose Reload latest, or Save mine as a copy to keep both.',
      '• “Not saved” or “Could not save”: storage may be full or blocked (private browsing). Export the project straight away, free some space, then reload.',
      '• A project “could not be read”: use Restore… on that message to bring back the latest checkpoint, or import your last exported file.',
      '• Import refused: only .brickwood.json files exported from this app can be imported; a file from a newer version needs the app updated first.',
      '• Working without internet: after the app has been opened once on a device, it opens and saves without a connection.',
      '• Something looks wrong after a change: Undo (Ctrl+Z) steps back one change at a time.',
    ],
  },
];

export function findTopics(query: string): HelpTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_TOPICS;
  const words = q.split(/\s+/);
  return HELP_TOPICS.filter((t) => {
    const text = `${t.title} ${t.body.join(' ')}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
