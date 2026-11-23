import { expect, test, type Page } from '@playwright/test';

// Clicks and the right panel (23 Nov 2026): drag the empty table to move the view, small things
// are easy to pick, the panel only shows when something is selected, Escape always to Select.
type Obj = { id: string; name: string; x: number; y: number };
type Mod = { id: string; label: string; x: number; y: number; width: number; depth: number };
type Hook = { state(): { project: { objects: Obj[]; modules: Mod[] }; selection: string[]; mode: string; view: { x: number; y: number; scale: number } }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state();
  return { objects: s.project.objects, modules: s.project.modules, selection: s.selection, mode: s.mode, view: s.view };
});
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('drag empty table pans; small pieces are easy to pick; panel and tool hint follow', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  const panel = page.getByRole('complementary', { name: 'Properties' });
  const hint = page.getByTestId('tool-hint');

  // Nothing selected: no panel; the status bar says what a click does.
  await expect(panel).toHaveCount(0);
  await expect(hint).toContainText('Select');
  await expect(hint).toContainText('drag the table to move the view');

  // Dragging an empty part of the table moves the view and selects nothing.
  let s = await st(page);
  const empty = await at(page, -6, -6);
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x + 60, empty.y + 30, { steps: 6 });
  await page.mouse.up();
  const after = await st(page);
  expect(after.view.x - s.view.x).toBeCloseTo(60, 0);
  expect(after.selection).toEqual([]);
  expect(after.modules.map((m) => [m.x, m.y])).toEqual(s.modules.map((m) => [m.x, m.y]));

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
  await expect(hint).toContainText('Drag to move it');

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
