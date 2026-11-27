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
