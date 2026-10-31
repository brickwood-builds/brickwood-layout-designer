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
      'Tick Erase to remove things on the drawing layer under the brush instead.',
      'It draws on the layer chosen in Layers → New items (for walkways, Surface details is a good choice). Two fingers still move and zoom on the iPad.',
      'The printout counts identical pieces, e.g. “Plate Round 1×1, Tan × 412”.',
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
