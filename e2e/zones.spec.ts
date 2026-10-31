import { expect, test, type Page } from '@playwright/test';

// Phase 2C: operating zones around moving rides.
type St = { project: { modules: { id: string; name: string; x: number; y: number; width: number; depth: number; clearanceStuds?: number }[] } };
type Hook = { state(): St; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state()) as Promise<St>;
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('a lamp inside the Swings operating zone warns; the zone is saved', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  const swings = (await st(page)).project.modules.find((m) => m.name === 'Swings')!;
  const c = await at(page, swings.x + 16, swings.y + 16);
  await page.mouse.click(c.x, c.y);
  const zone = page.getByLabel('Operating zone (studs all around)');
  await zone.fill('4');
  await zone.press('Enter');
  expect((await st(page)).project.modules.find((m) => m.name === 'Swings')!.clearanceStuds).toBe(4);
  await expect(page.getByRole('button', { name: 'No warnings' })).toBeVisible();
  // Drop a lamp 2 studs to the left of the ride (on the neighbouring plate).
  await page.getByText('Setup markers', { exact: true }).click();
  const lamp = page.getByRole('button', { name: 'Lamp', exact: true });
  const box = (await lamp.boundingBox())!;
  const to = await at(page, swings.x - 2, swings.y + 16);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: /1 warning/ }).click();
  await expect(page.getByRole('list', { name: 'Warnings' })).toContainText('Lamp is inside the operating zone of Swings');
});
