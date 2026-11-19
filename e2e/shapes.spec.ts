import { expect, test, type Page } from '@playwright/test';

// Shaped features (19 Nov 2026): draw a building that isn't a rectangle by clicking its corners.
type Mod = { id: string; name: string; label: string; x: number; y: number; width: number; depth: number; rotation: number; outline?: { x: number; y: number }[] };
type St = { project: { modules: Mod[] }; selection: string[]; mode: string };
type Hook = { state(): St; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state()) as Promise<St>;
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('draw an L-shaped building, pick it by its shape, and turn it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  // An empty spot to the right of everything.
  const mods = (await st(page)).project.modules;
  const ox = Math.max(0, ...mods.map((m) => m.x + m.width)) + 16;
  const oy = Math.min(0, ...mods.map((m) => m.y));

  await page.getByText('Features', { exact: true }).click();
  await page.getByRole('button', { name: 'Draw a shape…' }).click();
  await expect(page.getByRole('button', { name: 'Building shape' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Building name').fill('Town hall');
  // Corners of an L, slightly off the grid (they snap), going round.
  for (const [x, y] of [[0.2, 0.3], [32, 0], [31.8, 16.2], [16, 16], [16, 32], [0, 32]] as const) {
    const q = await at(page, ox + x, oy + y);
    await page.mouse.click(q.x, q.y);
  }
  await expect(page.getByText('6 points so far.')).toBeVisible();
  await page.getByRole('button', { name: 'Finish shape' }).click();

  let s = await st(page);
  const hall = s.project.modules.find((m) => m.name === 'Town hall')!;
  expect(hall).toMatchObject({ label: '', width: 32, depth: 32 });
  expect(hall.outline).toEqual([{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 16 }, { x: 16, y: 16 }, { x: 16, y: 32 }, { x: 0, y: 32 }]);
  expect(s.mode).toBe('select');
  expect(s.selection).toEqual([hall.id]);
  await expect(page.getByText('Shaped feature: 6 corners.')).toBeVisible();
  await page.screenshot({ path: 'test-results/shaped-feature.png' });

  // Clicking in the notch picks nothing; clicking the building picks it.
  await page.keyboard.press('Escape');
  const notch = await at(page, hall.x + 24, hall.y + 24);
  await page.mouse.click(notch.x, notch.y);
  expect((await st(page)).selection).toEqual([]);
  const wing = await at(page, hall.x + 8, hall.y + 24);
  await page.mouse.click(wing.x, wing.y);
  expect((await st(page)).selection).toEqual([hall.id]);

  // Turn it: still one piece, still an L.
  await page.keyboard.press('r');
  s = await st(page);
  expect(s.project.modules.find((m) => m.id === hall.id)).toMatchObject({ rotation: 90 });
});
