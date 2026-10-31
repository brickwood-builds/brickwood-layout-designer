import { expect, test, type Page } from '@playwright/test';

// Phase 4A: physical builds.
type Hook = { state(): { project: { modules: { id: string; name: string; label: string; x: number; y: number; width: number; depth: number }[]; builds: { code: string; storage: string; condition: string; photos: string[]; history: { kind: string }[] }[] }; selection: string[] }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state());
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('track a ride as a physical build: storage, condition, repair, photo, list', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByLabel(/Physical builds/).check();
  await page.getByRole('button', { name: 'More tools' }).click();

  const carousel = (await st(page)).project.modules.find((m) => m.name === 'Carousel')!;
  const c = await at(page, carousel.x + carousel.width / 2, carousel.y + carousel.depth / 2);
  await page.mouse.click(c.x, c.y);
  await page.getByRole('button', { name: 'Track as a physical build' }).click();
  const dialog = page.getByRole('dialog', { name: /PB-001 Carousel/ });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Stored at').fill('Garage shelf 2');
  await dialog.getByLabel('Stored at').press('Enter');
  await dialog.getByLabel('Condition').selectOption('needs-repair');
  await dialog.getByLabel('Kind of entry').selectOption('repair');
  await dialog.getByLabel('History entry').fill('Replaced the motor gear');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByLabel('Condition')).toHaveValue('good');
  await dialog.getByLabel('Add photo').setInputFiles({ name: 'carousel.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByRole('button', { name: /Open photo/ })).toHaveCount(1);

  const b = (await st(page)).project.builds[0]!;
  expect(b).toMatchObject({ code: 'PB-001', storage: 'Garage shelf 2', condition: 'good' });
  expect(b.photos).toHaveLength(1);
  expect(b.history.map((h) => h.kind)).toEqual(['created', 'storage', 'condition', 'repair', 'condition', 'photo']);

  // The list, and back to the plan.
  await dialog.getByRole('button', { name: '← All builds' }).click();
  const list = page.getByRole('dialog', { name: 'Physical builds' });
  await expect(list.getByRole('row', { name: /PB-001 Carousel Built Good Garage shelf 2/ })).toBeVisible();
  await list.getByRole('button', { name: 'PB-001' }).click();
  await page.getByRole('dialog', { name: /PB-001 Carousel/ }).getByRole('button', { name: 'Show on plan' }).click();
  expect((await st(page)).selection).toContain(carousel.id);
  await expect(page.getByText(/Physical build PB-001/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Builds (1)…' })).toBeVisible();
});
