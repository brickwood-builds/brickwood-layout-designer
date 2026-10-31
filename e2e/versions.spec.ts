import { expect, test, type Page } from '@playwright/test';

// Phase 4B: named versions, compare, preferred, open as a new project, go back.
type Hook = { state(): { project: { modules: { id: string; label: string; x: number; y: number; width: number; depth: number }[]; preferredVersion?: { name: string } } }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state());
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);
const ready = (page: Page) => page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

test('save a version, change the layout, compare, prefer, branch, go back', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await ready(page);
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByLabel(/^Versions/).check();
  await page.getByRole('button', { name: 'More tools' }).click();
  const count = (await st(page)).project.modules.length;

  await page.getByRole('button', { name: 'Versions…' }).click();
  let dialog = page.getByRole('dialog', { name: 'Versions' });
  await dialog.getByLabel('Version name').fill('2025 show — 16 ft');
  await dialog.getByRole('button', { name: 'Save this as a version' }).click();
  await expect(dialog.getByText('Saved “2025 show — 16 ft”.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Cut C-05 from the layout.
  const c05 = (await st(page)).project.modules.find((m) => m.label === 'C-05')!;
  const c = await at(page, c05.x + 2, c05.y + 2);
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Delete');
  expect((await st(page)).project.modules).toHaveLength(count - 1);

  await page.getByRole('button', { name: 'Versions…' }).click();
  dialog = page.getByRole('dialog', { name: 'Versions' });
  await dialog.getByRole('button', { name: 'Compare with now' }).click();
  const cmp = page.getByRole('dialog', { name: 'Compare versions' });
  await expect(cmp.getByRole('heading', { name: 'Removed (1)' })).toBeVisible();
  await expect(cmp.getByRole('listitem').filter({ hasText: /^C-05$/ })).toBeVisible();
  await expect(cmp.locator('.compare-svg svg')).toHaveCount(2);
  await cmp.getByRole('button', { name: '← Versions' }).click();

  dialog = page.getByRole('dialog', { name: 'Versions' });
  await dialog.getByRole('button', { name: 'Make preferred' }).click();
  expect((await st(page)).project.preferredVersion?.name).toBe('2025 show — 16 ft');
  await dialog.getByRole('button', { name: 'Open as a new project' }).click();
  await expect(dialog.getByText(/Made a new project “Brickwood Adventure Park — 2025 show — 16 ft”/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Go back to this…' }).click();
  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Go back to this version' }).click();
  await reloaded;
  await ready(page);
  await expect.poll(async () => (await st(page)).project.modules.length).toBe(count);
  expect((await st(page)).project.preferredVersion?.name).toBe('2025 show — 16 ft');

  await page.getByRole('button', { name: '← Projects' }).click();
  await expect(page.getByRole('article', { name: 'Brickwood Adventure Park — 2025 show — 16 ft' })).toBeVisible();
});
