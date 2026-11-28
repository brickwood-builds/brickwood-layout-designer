import { expect, test, type Page } from '@playwright/test';

// Clicks and the right panel (23 Nov 2026): in Select a drag on empty table draws a box, small
// things are easy to pick, the panel only shows when something is selected, Escape to Select.
type Obj = { id: string; name: string; x: number; y: number };
type Mod = { id: string; label: string; x: number; y: number; width: number; depth: number };
type Hook = { state(): { project: { objects: Obj[]; modules: Mod[] }; selection: string[]; mode: string; view: { x: number; y: number; scale: number } }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state();
  return { objects: s.project.objects, modules: s.project.modules, selection: s.selection, mode: s.mode, view: s.view };
});
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('drag a box to select; small pieces are easy to pick; panel and tool hint follow', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/classic.html');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  const panel = page.getByRole('complementary', { name: 'Properties' });
  const hint = page.getByTestId('tool-hint');

  // Nothing selected: no panel; the status bar says what a click does.
  await expect(panel).toHaveCount(0);
  await expect(hint).toContainText('Select');
  await expect(hint).toContainText('drag empty table to move the view');

  // Dragging an empty part of the table (nothing under the pointer) moves the view.
  const v0 = (await st(page)).view;
  const empty = await at(page, -6, -6);
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x + 60, empty.y + 30, { steps: 6 });
  await page.mouse.up();
  const v1 = (await st(page)).view;
  expect(v1.x - v0.x).toBeCloseTo(60, 0);
  expect((await st(page)).selection).toEqual([]);

  // Dragging over plates draws a box (here starting on A-02, above B-02): it picks what's fully inside,
  // and the view stays put.
  let s = await st(page);
  const b01 = s.modules.find((m) => m.label === 'B-01')!;
  // Over a plate that isn't selected the pointer is the plain arrow (a drag won't move it).
  const canvas = page.getByTestId('canvas');
  const over = await at(page, b01.x + 8, b01.y + 8);
  await page.mouse.move(over.x, over.y);
  await page.mouse.move(over.x + 1, over.y + 1);
  await expect(canvas).toHaveCSS('cursor', 'default');
  const from = await at(page, b01.x + b01.width + 1, b01.y - 2);
  const to = await at(page, b01.x - 2, b01.y + b01.depth + 1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const after = await st(page);
  expect(after.view).toEqual(s.view);
  expect(after.modules.map((m) => [m.x, m.y])).toEqual(s.modules.map((m) => [m.x, m.y]));
  expect(after.selection).toContain(b01.id);
  await expect(panel).toBeVisible();
  // Now it's selected, the four-arrow pointer says a drag will move it.
  await page.mouse.move(over.x, over.y);
  await page.mouse.move(over.x + 1, over.y + 1);
  await expect(canvas).toHaveCSS('cursor', 'move');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  // A brick on module C-05, at the whole-layout zoom (a few pixels wide).
  await page.getByRole('button', { name: 'Fit' }).click();
  const c05 = (await st(page)).modules.find((m) => m.label === 'C-05')!;
  await page.getByText('Single pieces', { exact: true }).click();
  await page.getByRole('button', { name: 'Brick 2×4', exact: true }).click();
  const spot = await at(page, c05.x + 16, c05.y + 16);
  await page.mouse.click(spot.x, spot.y);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); // lets go of the brick too
  await expect(panel).toHaveCount(0);
  const brick = (await st(page)).objects.find((o) => o.name === 'Brick 2×4')!;

  // A click 3 pixels above the brick (on the plate) picks the brick, not the plate.
  const top = await at(page, brick.x + 2, brick.y);
  await page.mouse.click(top.x, top.y - 3);
  s = await st(page);
  expect(s.selection).toEqual([brick.id]);
  await expect(panel).toBeVisible();
  await expect(hint).toContainText('Drag what’s selected to move it');

  // Clicking empty table lets go; the panel closes.
  const away = await at(page, -6, -6);
  await page.mouse.click(away.x, away.y);
  expect((await st(page)).selection).toEqual([]);
  await expect(panel).toHaveCount(0);

  // Any tool: the hint names it, and Escape goes back to Select.
  await page.getByRole('button', { name: 'Erase', exact: true }).click();
  await expect(hint).toContainText('Erase');
  await page.keyboard.press('Escape');
  expect((await st(page)).mode).toBe('select');
  await page.getByRole('button', { name: 'Measure', exact: true }).click();
  await expect(hint).toContainText('Measure');
  await page.keyboard.press('Escape');
  expect((await st(page)).mode).toBe('select');
});
