# Save to a file (OneDrive folder): progress report

**Date:** 31 Oct 2026 · Interim step toward 1E. Owner's choice: "B now, A later". Option A is in-app OneDrive sign-in through a Microsoft app registration.

## What it does

- **Save to a file…** (bottom bar of the editor, Chrome or Edge on a computer): pick a file, ideally inside your OneDrive folder. From then on every successful save also writes the project to that file in the normal `.brickwood.json` export format, and the OneDrive desktop app syncs it. The bottom bar shows "✓ file name"; its menu has "Stop saving to this file".
- **Open file…** (project list): open a project file, for example on another computer from the same OneDrive folder. It opens in the editor and keeps saving to that file. If this computer already had a different version of the project, that version is kept as a checkpoint first.
- **No silent overwrites:**
  - before each write the app checks that the file still holds the version it last wrote or read (by revision ID);
  - if the file was changed elsewhere, nothing is written and a banner offers **Use the file's version** or **Keep this version**;
  - "Use the file's version" checkpoints the local copy first; "Keep this version" overwrites the file only because the user chose it.
- **Permission:** browsers forget file-write permission after a restart. The bar then shows "Resume saving to …", and one click brings it back.
- **Writes happen one at a time:** two quick saves can't race and trigger a false "changed elsewhere" warning.
- **Browsers without file access** (Safari, Firefox, iPad) show no file buttons; everything else works as before.
- Help: new topic "Saving to OneDrive (or any folder)".

## Tests

- Unit: 7 new tests. They cover:
  - linking writes the export format;
  - a file changed elsewhere is refused and left untouched until the user chooses to overwrite;
  - an empty new file isn't treated as a change;
  - permission prompt and request;
  - unlink;
  - the database store, including its memory fallback;
  - loading the file's version (keeps that revision, checkpoints the local copy, and normal saves continue from it).
- Browser: 5 new tests, using a stand-in for the file picker because the real one can't be automated:
  - link, then every save goes to the file;
  - a change from "another computer" shows the banner, the file is untouched, and "Use the file's version" loads it;
  - "Keep this version";
  - "Open file…" on the project list;
  - no file buttons in browsers without support.
- Totals: **88 unit, 43 browser**, all passing.

## Limits

- Chrome or Edge on Windows or Mac only (the File System Access API). Not on iPad Safari; Option A will cover the iPad.
- Avoid editing the same project on two computers at once. The app will catch it and ask, but it can't merge changes.
- The real Windows file picker and OneDrive syncing haven't been tested here (no Windows/OneDrive in this environment). Please try it once.
