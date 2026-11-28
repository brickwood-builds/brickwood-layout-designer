// Help for the app's (new) interface. Bundled, so it works offline. The planning tools work as
// in the classic version, so their topics reuse that text with the menu directions changed.
import { HELP_TOPICS, type HelpTopic } from '../help/topics';

/** Which topic opens first from each place. */
export const NEXT_HELP_START = {
  home: 'quick-start',
  editor: 'quick-start',
  draw: 'drawing',
  erase: 'drawing',
  measure: 'measuring',
  shape: 'shapes',
  placing: 'adding',
} as const;

/** The classic topic, with the directions for where things are changed for this interface. */
function from(id: string, title?: string, extra: string[] = []): HelpTopic {
  const t = HELP_TOPICS.find((x) => x.id === id)!;
  const fix = (s: string) =>
    s
      .replace(/Switch on ([^.]+?) in the ⋯ menu( \([^)]*\))?\. ?/g, 'Switch on $1 in Plan → Choose tools…$2. ')
      .replace(/Switch on ([^.]+?) in the ⋯ menu,/g, 'Switch on $1 in Plan → Choose tools…,')
      .replace(/(A )?([A-Z][\w ]*…) button appears at the bottom/g, '$2 appears in the Plan menu')
      .replace(/\b([A-Z][\w ]*…)( at the bottom)/g, 'Plan → $1')
      .replace(/then click Versions… at the bottom/g, 'then Plan → Versions…')
      .replace(/Projects → More → Export file/g, 'the layout’s ⋯ → Save as a file, on the projects screen')
      .replace(/Projects → More → Checkpoints…/g, 'the layout’s ⋯ → Checkpoints, on the projects screen')
      .replace(/On the Projects page/g, 'On the projects screen')
      .replace(/⋯ → Display report…/g, '⋯ (top right) → Display report…')
      .replace(/⋯ → Share a read-only view…/g, 'Plan → Choose tools… → Share a read-only view…')
      .replace(/⋯ \(top right\) → Heights/g, 'Plan → Choose tools… → Heights')
      .replace(/in the bottom bar/g, 'in the Plan menu')
      .replace(/in the details panel/g, 'in Details → All details')
      .replace(/Table…/g, '⋯ → Table shape and size…')
      .replace(/choose Track as a physical build/g, 'choose Track as a physical build (Details → All details…)')
      .replace(/choose a container under Put in/g, 'choose a container under Put in (Details → All details…)')
      .replace(/…\. /g, '… ')
      .replace(/…\.$/g, '…');
  return { id: t.id, title: title ?? t.title, body: [...t.body.map(fix), ...extra] };
}

export const NEXT_HELP_TOPICS: HelpTopic[] = [
  {
    id: 'quick-start',
    title: 'Quick start',
    body: [
      'The layout fills the screen, and the controls come to you:',
      '• Top bar: back to your layouts, the layout’s name (click to rename), a dot that is green when everything is saved, Add, Undo and Redo, warnings (or “All good”), Layers, Plan and ⋯ for the table, printing and files.',
      '• Add (left): everything you can put on the table — plates, buildings and rides, items and markers, LEGO pieces, your designs. Pick one, then click (or tap) on the table for each one you want.',
      '• Select something and a small bar appears just above it: turn, turn a little, duplicate, edit shape, details and delete. Right-click (or press and hold on the iPad) for the same and a few more.',
      '• Tools (bottom): Select, Move the view, Draw, Erase and Measure. A dark line just above them says what a click does right now, and Escape always gets you back to Select.',
      '• Fit (bottom right) shows the whole table.',
      'Everything saves by itself within a second. The classic version (classic.html) works on the same layouts, if you need something not here yet.',
    ],
  },
  {
    id: 'adding',
    title: 'Adding plates, buildings, items and pieces',
    body: [
      'Click Add (top bar) to open the library. Choose a kind — Plates, Buildings, Items, Pieces, Designs — or just type in the search box (“16x16”, “bench”, “tile 2x2”, “3024”); searching looks through everything.',
      'Click a tile: it stays picked (blue), and each click on the table puts one down there, centred where you click. Pick another tile to switch. Click the picked tile again, press Escape or Done to stop. You can also drag a tile onto the table to drop just one.',
      'Buildings and rides: New building… makes a box of any size with a name; Draw a shape… lets you click its corners (see Shapes). Items: your own items and markers are listed; New item… makes a new one (name, size, LEGO colour) and adds it to the list; Draw a shape… draws one corner by corner.',
      'Pieces: the common plates, tiles and bricks, or search about 2,400 real LEGO parts by name, size or number. Not there? Use “Not here? Look it up online…” at the end of the results (see Finding LEGO parts online).',
      'MILS plates get the next free ID (A-, B-, C-…), never one that is written on a stored plate.',
      'On an upright iPad the library sits over the layout: it closes as soon as you pick something; tap Add to open it again.',
    ],
  },
  {
    id: 'selecting',
    title: 'Selecting and moving',
    body: [
      '• Click (or tap) something to select it. Shift-click adds or removes things.',
      '• To select several, drag a box around them — you can start the box on top of plates. It picks what’s fully inside.',
      '• To move something, select it, then drag it. The four-arrow pointer shows when a drag will move what’s selected. Things sitting on a plate move with it.',
      '• Arrow keys nudge by a stud (Shift: 10 studs).',
      '• Drag an empty part of the table to move the view; or use the hand tool, hold Space, drag with the middle mouse button, or use two fingers on the iPad. Scroll or pinch to zoom.',
      '• Clicking near a small piece picks the piece, not the plate under it.',
      '• Undo (Ctrl+Z) and Redo (Ctrl+Shift+Z) are in the top bar too; each change is one step.',
      'A red outline while dragging means it would overlap something or hang off the table — you can still drop it; it shows in the warnings.',
    ],
  },
  {
    id: 'turning',
    title: 'Turning things',
    body: [
      'The bar above a selection has Turn a quarter (or press R; Shift+R turns the other way) and Turn 5°.',
      'For a piece that doesn’t sit square: [ and ] turn it a degree at a time (with Shift, 5°), or type an exact Angle in Details. A group turns as one, around its middle, and things sitting on a plate turn with it.',
      'A turned piece is drawn turned, clicks follow its shape, and warnings use its real corners (a corner poking past the table edge counts).',
    ],
  },
  {
    id: 'details',
    title: 'Details, names and colours',
    body: [
      'Select something and click Details (ⓘ) on the bar above it — or right-click → Details. The card shows what you change most: its name (or a plate’s ID), size in studs, angle and colour. Type and press Enter.',
      'All details… shows everything else: notes, position, which plates it’s on, its layer, heights, build and packing records, Add to palette, Save as design, group options and more.',
      'Small items can show their name on the layout (All details → Show its name on the layout), so the whole display shows what’s where; it applies to all of that kind in the layout.',
    ],
  },
  {
    id: 'shapes',
    title: 'Buildings and items that aren’t rectangles',
    body: [
      'Add → Buildings → Draw a shape… (or Items → Draw a shape…): type a name, then click each corner on the table, all the way round. Corners snap to the stud grid. Finish shape (or double-click, or Enter) makes it; Take back removes the last corner; Clear starts again.',
      'A shape you’ve just drawn starts out ready to edit: drag a round corner to move it, drag a + in the middle of a side to add a corner, double-click a corner to remove it. Each change is one Undo; Escape when done.',
      'To edit a shape later — or give a plain building a notch — select it and click Edit shape on the bar above it.',
      'A drawn item goes in Items so you can place more of the same shape. A building in the notch of an L doesn’t count as overlapping it.',
    ],
  },
  {
    id: 'table',
    title: 'The table: size, L, U or ring, joins, shelves',
    body: [
      '⋯ (top right) → Table shape and size… sets the table’s name and size in inches. Shape can be a Rectangle, an L, a U, or a Ring of tables with an open middle: give the overall size, how deep the tables are and (for an L or U) which corner or side. A preview shows it. Plates may cross the joins between tables; anything over the open middle gets an overhang warning.',
      'Mark table joins… (in the same window) shows where one table ends and the next begins: click across the table at each join; click a join again to remove it; Shift-click turns a line the other way; Escape when done. The window then says how many tables they make.',
      'Add a level… adds another surface, such as a shelf above the table, with its own size and height above the floor. A level picker then appears in the top bar.',
    ],
  },
  {
    id: 'drawing',
    title: 'Drawing walkways, lawns and rows; erasing',
    body: [
      'Draw (pencil, or B) paints pieces: choose what to draw with (quick picks for the usual pieces, or Another piece…), a colour, Freehand / Straight / Fill a box / Curve, and the width in studs. Then drag on the table. One piece goes in each spot and painting over doesn’t double it up. Each stroke is one Undo.',
      'Curve: click the points it should pass through, then Finish curve (or double-click).',
      'More options… has the rest: spacing (a lamp every 8 studs), stacking layers to build a slope, and stairs.',
      'The card can be folded away (−) so it doesn’t cover the part of the layout you’re drawing on.',
      'Erase (or E): drag over pieces, items and markers to remove them. Plates and buildings are never erased; things on a locked or hidden layer are kept safe.',
    ],
  },
  {
    id: 'measuring',
    title: 'Measuring',
    body: [
      'Measure (ruler, or M): drag between two points; hold Shift for a straight line. The length shows on the layout and in the card. Keep this dimension saves it (with a label if you like) so it shows on the plan and printout.',
    ],
  },
  {
    id: 'layers',
    title: 'Layers and the finished look',
    body: [
      'Layers (top bar): show or hide each layer, lock it so it can’t be selected, and choose which layer new items go on. MILS IDs & names shows or hides the labels. Finished look shows plates in their real LEGO colours.',
      'Lock the plates layer when you’re placing small things so you can’t move a plate by accident.',
    ],
  },
  {
    id: 'warnings',
    title: 'Warnings',
    body: [
      'The top bar shows “All good”, or how many things overlap or hang off the table. Click it for the list; click a warning to select those things.',
      'Overlaps you mean (a building built on its base) aren’t warned about. Things on different layers stack freely.',
    ],
  },
  {
    id: 'plan',
    title: 'Plan: parts, versions, builds, packing, shows',
    body: [
      'The planning tools are switched on per layout, so a layout stays simple until you need them: Plan (top bar) → Choose tools….',
      'Once on, each opens from the Plan menu: Parts list (and shopping list), Versions, Builds, Packing, Shows, Setup; and Heights (Shade by height, Show up to). The topics below explain each one.',
    ],
  },
  from('parts-list'),
  from('versions'),
  from('builds'),
  from('packing'),
  from('shows'),
  from('setup'),
  from('heights'),
  from('designs', 'Reusable designs', ['In this version: select what to reuse, open Details → All details…, and choose Save as design…. Designs are in Add → Designs; pick one and click to place copies.']),
  from('stairs', 'Stairs', ['In this version: Draw → More options… → Shape: Stairs.']),
  {
    id: 'parts-online',
    title: 'Finding LEGO parts online (Rebrickable)',
    body: [
      'In Add → Pieces, search by name, size or number. If it isn’t there, use “Not here? Look it up online…” at the end of the results and paste your own free Rebrickable key (rebrickable.com → Profile → Settings → API). Then “Look up … on Rebrickable” searches every LEGO part; BrickLink numbers work too.',
      'Parts you look up are kept on this device and found again offline. Part numbers shown and stored are BrickLink’s.',
      'The key is entered once: with OneDrive sync on it goes to your other devices; it is never put in layout files, exports or backups.',
    ],
  },
  {
    id: 'print',
    title: 'Printing, PDF and pictures',
    body: [
      '⋯ (top right) → Print, PDF and pictures… opens the printable plan: the overhead drawing with IDs and ride names, then lists of modules (positions from the back-left corner of the table), rides with power, markers and saved dimensions. Print / Save PDF uses the browser’s print window — choose “Save as PDF” for a file. Download picture saves a PNG; Download drawing saves an SVG that stays sharp.',
    ],
  },
  from('report-share'),
  {
    id: 'saving',
    title: 'Saving, backups and earlier versions',
    body: [
      'There’s no Save button: every change is saved within about a second. The dot next to the name is green when saved, yellow while saving, red if something went wrong (a bar then explains).',
      'On the projects screen, Back up everything saves one file with every layout, its versions, build photos and your parts list. Restore from backup… shows what’s in the file before anything changes. A reminder appears when it’s been two weeks since the last backup.',
      'Each layout’s ⋯ (on the projects screen) has Save as a file, Duplicate, Rename, Archive, and Checkpoints — snapshots taken every 10 minutes while you work; preview one and restore it (the current version is kept as a checkpoint first). Import brings a saved file back in, as a copy if it’s already here.',
    ],
  },
  {
    id: 'onedrive-sync',
    title: 'OneDrive sync (computer and iPad)',
    body: [
      'With OneDrive sync, your layouts, parts list, saved versions and build photos follow you between the computer and the iPad through your own OneDrive. The app only uses its own folder (OneDrive → Apps → Brickwood Layout Designer).',
      'The OneDrive bar is on the projects screen: Set up OneDrive sync… once (a free app registration with Microsoft), then Sign in to OneDrive on each device. Sign in from the app’s normal address.',
      'Then it syncs by itself: a few seconds after a change, when the app opens or comes back online, and every few minutes. ☁ next to the layout’s name shows it; click it (or Sync now on the projects screen) to sync straight away. It works offline and catches up later.',
      'If the same layout was changed on two devices before they synced, nothing is overwritten: the projects screen asks which copy to keep, and the other is kept as a checkpoint. If a newer copy arrives while the layout is open, a bar offers Load the update.',
      'Sign out stops syncing on this device; nothing is deleted.',
    ],
  },
  {
    id: 'onedrive',
    title: 'Saving to a file (OneDrive folder, any computer)',
    body: [
      'In Chrome or Edge on a computer, ⋯ (top right) → Save to a file… lets you pick a file — put it in your OneDrive folder. From then on every save also goes to that file, and OneDrive copies it to the cloud.',
      'On another computer, choose Open a file… on the projects screen and pick the same file. It opens there and keeps saving to it.',
      'If the file was changed on another computer since this one last saved it, nothing is overwritten: you choose Use the file’s version or Keep this version, and the other is kept as a checkpoint.',
      'After restarting the browser it may offer Resume saving to …: click it and allow access.',
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    body: [
      '• V select · H move the view (or hold Space) · B draw · E erase · M measure · Escape back to Select / let go',
      '• R turn a quarter (Shift+R the other way) · [ and ] turn 1° (Shift: 5°)',
      '• Ctrl+C copy · Ctrl+V paste (then click where each copy goes) · Ctrl+D duplicate · Delete remove',
      '• Ctrl+G group · Ctrl+Shift+G ungroup · Ctrl+A select all',
      '• Arrow keys nudge 1 stud (Shift: 10) · F show the whole table · + and − zoom',
      '• Ctrl+Z undo · Ctrl+Shift+Z redo · ? help',
    ],
  },
  {
    id: 'ipad',
    title: 'On the iPad',
    body: [
      'Tap to select or place; drag a selected thing to move it; drag empty table or use two fingers to move the view; pinch to zoom. Press and hold on the layout for the same menu as a right-click.',
      'Upright, the library sits over the layout: tap Add to open it; it closes when you pick something.',
      'After opening the app once (online), it opens and saves without internet — handy at a show.',
    ],
  },
  {
    id: 'classic',
    title: 'The classic version',
    body: [
      'The previous interface is still at classic.html (link on the projects screen, or ⋯ → Open in the classic version). It works on the same layouts, so changes in either show in the other.',
    ],
  },
  from('units'),
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    body: [
      '• “This layout was changed in another tab”: the same layout is open twice (maybe once in the classic version). Choose Reload latest, or Save mine as a copy to keep both.',
      '• “Could not save”: storage may be full or blocked (private browsing). Save the layout as a file straight away, free some space, then reload.',
      '• A layout “couldn’t be read”: use Restore… on that message to bring back the latest checkpoint, or import your last saved file.',
      '• Something looks wrong after a change: Undo (Ctrl+Z) steps back one change at a time.',
      '• A control seems missing: it may be in the classic version for now (⋯ → Open in the classic version).',
    ],
  },
];
