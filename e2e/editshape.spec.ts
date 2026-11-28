import { expect, test, type Page } from '@playwright/test';

// Editing a shape's corners after it's made (27 Nov 2026).
type Mod = { id: string; name: string; x: number; y: number; width: number; depth: number; outline?: { x: number; y: number }[] };
type Hook = { state(): { project: { modules: Mod[] } }; toPage(x: number, y: number): { x: number; y: number } };
const hall = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().project.modules.find((m) => m.name === 'Town hall')!);
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

test('edit a feature’s shape: move a corner, add one from a side, remove one', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/classic.html');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByText('Features', { exact: true }).click();
  await page.getByRole('button', { name: 'New…' }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Town hall');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  let m = await hall(page);
  expect(m).toMatchObject({ width: 32, depth: 32 });

  await page.getByRole('button', { name: 'Edit shape' }).click();
  await expect(page.getByTestId('tool-hint')).toContainText('Edit shape');

  // Pull a corner out of the middle of the top side and drag it down 8 studs: a notch.
  await drag(page, await at(page, m.x + 16, m.y), await at(page, m.x + 16, m.y + 8));
  m = await hall(page);
  expect(m.outline).toHaveLength(5);
  expect(m.outline).toContainEqual({ x: 16, y: 8 });

  // Move the bottom-right corner out by 4 studs.
  await drag(page, await at(page, m.x + 32, m.y + 32), await at(page, m.x + 36, m.y + 32));
  m = await hall(page);
  expect(m.width).toBe(36);
  await page.screenshot({ path: 'test-results/edit-shape.png' });

  // Double-click the notch corner to remove it again.
  const notch = await at(page, m.x + 16, m.y + 8);
  await page.mouse.dblclick(notch.x, notch.y);
  m = await hall(page);
  expect(m.outline).toHaveLength(4);
  expect(m.outline).not.toContainEqual({ x: 16, y: 8 });

  // Each change is one Undo.
  await page.keyboard.press('Control+z');
  expect((await hall(page)).outline).toHaveLength(5);

  await page.getByRole('button', { name: 'Done editing shape' }).click();
  await expect(page.getByRole('button', { name: 'Edit shape' })).toBeVisible();
});
