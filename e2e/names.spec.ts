import { expect, test, type Page } from '@playwright/test';

// A small item can show its name on the layout, so the overview shows what's where (22 Nov 2026).
type Obj = { id: string; name: string; showName?: boolean };
type Hook = { state(): { project: { objects: Obj[] } }; toPage(x: number, y: number): { x: number; y: number } };
const objects = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().project.objects);
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('a new small item with its name shown; turning it off for one turns it off for all of them', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

  await page.getByText('Small items', { exact: true }).click();
  await page.getByRole('button', { name: '+ New item…' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name', { exact: true }).fill('Game building');
  await dlg.getByLabel('Width (studs)').fill('12');
  await dlg.getByLabel('Depth (studs)').fill('8');
  await dlg.getByLabel(/Show its name on the layout/).check();
  await dlg.getByRole('button', { name: 'Add', exact: true }).click();

  // Put two more down from the palette.
  await page.getByRole('button', { name: 'Game building', exact: true }).click();
  for (const [x, y] of [[20, 30], [60, 30]] as const) {
    const q = await at(page, x, y);
    await page.mouse.click(q.x, q.y);
  }
  await page.keyboard.press('Escape');
  let objs = (await objects(page)).filter((o) => o.name === 'Game building');
  expect(objs).toHaveLength(3);
  expect(objs.every((o) => o.showName)).toBe(true);

  // Zoomed out to the whole table, the names are still there.
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.screenshot({ path: 'test-results/item-names.png' });

  // Select one: its panel has the setting; unticking it applies to all three.
  const q = await at(page, 20, 30);
  await page.mouse.click(q.x, q.y);
  const box = page.getByLabel('Show its name on the layout (all 3 in this project)');
  await expect(box).toBeChecked();
  await box.uncheck();
  objs = (await objects(page)).filter((o) => o.name === 'Game building');
  expect(objs.some((o) => o.showName)).toBe(false);
});
