import { expect, test, type Page } from '@playwright/test';

// The app's (new) interface at ./ — same layouts as the classic version (classic.html).
type Hook = { state(): { project: { name: string; modules: { id: string; label: string; x: number; y: number; width: number }[]; objects: { name: string }[] }; selection: string[] }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state());
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);
const ready = (page: Page) => page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

test('add a plate from the library, change it in Details; the classic version shows the same layout', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Development' }).click();
  await ready(page);

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
  await expect(page.locator('.nx-saved.saved')).toBeVisible();

  // Same layout in the classic version.
  await page.goto('/classic.html');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await ready(page);
  expect((await st(page)).project.modules.find((m) => m.id === plate.id)).toMatchObject({ width: 32 });
});

test('the old trial address leads to the app, keeping a layout link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Development' }).click();
  await ready(page);
  const hash = await page.evaluate(() => window.location.hash);
  await page.goto(`/next.html${hash}`);
  await page.waitForURL((u) => !u.pathname.endsWith('next.html'));
  await ready(page);
  expect((await st(page)).project.name).toBe('Development');
});

test('Plan menu, print page and the classic link are there', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Brickwood Adventure Park' }).click();
  await ready(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More tools' })).toBeVisible();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('link', { name: /Open in the classic version/ })).toHaveAttribute('href', /classic\.html#\/project\//);
  await page.getByRole('button', { name: /Print, PDF and pictures/ }).click();
  await expect(page).toHaveURL(/\/print$/);
});

test('right-click menu, and the Draw card paints with a quick pick', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Brickwood Adventure Park' }).click();
  await ready(page);
  const before = (await st(page)).project.modules.length;
  const c05 = (await st(page)).project.modules.find((m) => m.label === 'C-05')!;
  const q = await at(page, c05.x + 16, c05.y + 16);
  await page.mouse.click(q.x, q.y, { button: 'right' });
  await expect(page.getByRole('menu', { name: 'Actions' })).toBeVisible();
  expect((await st(page)).selection).toEqual([c05.id]);
  await page.getByRole('menuitem', { name: /Duplicate/ }).click();
  expect((await st(page)).project.modules).toHaveLength(before + 1);
  await expect(page.getByRole('menu', { name: 'Actions' })).toHaveCount(0);

  // Draw: the card's quick pick, then a stroke below the table on the left (clear of the card).
  await page.getByRole('button', { name: 'Draw pieces, e.g. a walkway (B)' }).click();
  const card = page.getByRole('complementary', { name: 'Draw' });
  await card.getByRole('button', { name: 'Plate 1×2', exact: true }).click();
  await card.getByRole('group', { name: 'Width (studs)' }).getByRole('button', { name: '1', exact: true }).click();
  const a = await at(page, 60, 150.5);
  const b = await at(page, 90, 150.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  expect((await st(page)).project.objects.filter((o) => o.name === 'Plate 1×2').length).toBeGreaterThan(10);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});

test('the app opens offline after the first visit (the iPad at a show)', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active);
  await page.reload(); // now under the offline worker
  await expect(page.getByRole('heading', { name: 'Your layouts' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your layouts' })).toBeVisible();
  await context.setOffline(false);
});
