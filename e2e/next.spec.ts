import { expect, test, type Page } from '@playwright/test';

// The trial interface (next.html): its own copies; the app's projects are never changed.
type Hook = { state(): { project: { name: string; modules: { id: string; label: string; x: number; y: number; width: number }[] }; selection: string[] }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state());
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('trial interface: add a plate from the library, change it in Details; the app’s copy is untouched', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  // The app first (it makes its starter layouts on this device).
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Development', exact: true })).toBeVisible();

  await page.goto('/next.html');
  await page.getByRole('button', { name: 'Copy my layouts in' }).click();
  await expect(page.getByText(/Copied \d+ layout/)).toBeVisible();
  await page.getByRole('button', { name: 'Open Development' }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

  // Library: pick a 16×16 plate, click the table.
  await page.getByRole('button', { name: /^16×16/ }).click();
  const q = await at(page, 40, 40);
  await page.mouse.click(q.x, q.y);
  await page.keyboard.press('Escape');
  let s = await st(page);
  expect(s.project.modules).toHaveLength(1);
  const plate = s.project.modules[0]!;

  // Selected: the floating bar shows; Details changes its width.
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByLabel('Width').fill('32');
  await page.getByLabel('Width').press('Enter');
  s = await st(page);
  expect(s.project.modules[0]!.width).toBe(32);
  await expect(page.getByRole('button', { name: 'All good' })).toBeVisible();

  // The app's Development layout still has no plates.
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  expect((await st(page)).project.modules.find((m) => m.id === plate.id)).toBeUndefined();
});

test('trial interface: right-click menu, and the Draw card paints with a quick pick', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/next.html');
  await page.getByRole('button', { name: 'Open Brickwood Adventure Park' }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  const before = (await st(page)).project.modules.length;
  const c05 = (await st(page)).project.modules.find((m) => m.label === 'C-05')!;
  const q = await at(page, c05.x + 16, c05.y + 16);
  await page.mouse.click(q.x, q.y, { button: 'right' });
  await expect(page.getByRole('menu', { name: 'Actions' })).toBeVisible();
  expect((await st(page)).selection).toEqual([c05.id]);
  await page.getByRole('menuitem', { name: /Duplicate/ }).click();
  expect((await st(page)).project.modules).toHaveLength(before + 1);
  await expect(page.getByRole('menu', { name: 'Actions' })).toHaveCount(0);

  // Draw: the card's quick pick, then a stroke on the empty end of the table.
  await page.getByRole('button', { name: 'Draw pieces, e.g. a walkway (B)' }).click();
  const card = page.getByRole('complementary', { name: 'Draw' });
  await card.getByRole('button', { name: 'Plate 1×2', exact: true }).click();
  await card.getByRole('group', { name: 'Width (studs)' }).getByRole('button', { name: '1', exact: true }).click();
  // Below the table on the left (clear of the card on the right): pieces may go off the table.
  const a = await at(page, 60, 150.5);
  const b = await at(page, 90, 150.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  const pieces = await page.evaluate(() => (window as unknown as { __brickwoodEditor: { state(): { project: { objects: { name: string }[] } } } }).__brickwoodEditor.state().project.objects.filter((o) => o.name === 'Plate 1×2').length);
  expect(pieces).toBeGreaterThan(10);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});
