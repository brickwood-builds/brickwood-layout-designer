import { expect, test, type Page } from '@playwright/test';

// Turning a piece by hand (25 Nov 2026).
type Obj = { id: string; name: string; rotation: number; tilt?: number };
type Hook = { state(): { project: { objects: Obj[] } }; toPage(x: number, y: number): { x: number; y: number } };
const brick = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().project.objects.find((o) => o.name === 'Brick 2×4')!);
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('turn a piece a few degrees with the buttons, the keys, or by typing the angle', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/classic.html');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByText('Single pieces', { exact: true }).click();
  await page.getByRole('button', { name: 'Brick 2×4', exact: true }).click();
  const q = await at(page, 20, 20);
  await page.mouse.click(q.x, q.y);
  await page.keyboard.press('Escape'); // stop placing; the new brick stays selected

  await page.getByRole('button', { name: '↻ 5°' }).click();
  await page.getByRole('button', { name: '↻ 5°' }).click();
  expect(await brick(page)).toMatchObject({ rotation: 0, tilt: 10 });
  await expect(page.getByLabel('Angle (°)')).toHaveValue('10');
  await page.mouse.move(q.x, q.y + 200); // keys go to the layout, not a text box
  await page.keyboard.press(']');
  expect((await brick(page)).tilt).toBe(11);
  await page.getByLabel('Angle (°)').fill('-3');
  await page.getByLabel('Angle (°)').press('Enter');
  expect(await brick(page)).toMatchObject({ rotation: 0, tilt: -3 });
  await page.getByRole('button', { name: 'Fit' }).click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.screenshot({ path: 'test-results/turned.png' });
  await page.getByLabel('Angle (°)').fill('0');
  await page.getByLabel('Angle (°)').press('Enter');
  expect((await brick(page)).tilt).toBeUndefined();
});
