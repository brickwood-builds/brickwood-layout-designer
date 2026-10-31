import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Phase 3B: parts list — needed, have, to buy, and the shopping list download.
test('parts list: switch it on, type what I have, download the shopping list', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  // Hidden until switched on.
  await expect(page.getByRole('button', { name: 'Parts list…' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByLabel(/Parts & inventory/).check();
  await page.getByRole('button', { name: 'More tools' }).click();

  // Three 2×16 plates from the parts list.
  await page.getByText('Single pieces', { exact: true }).click();
  await page.getByLabel('Search single pieces').fill('4282');
  const add = page.locator('.part-row', { hasText: '4282' }).first().getByRole('button').first();
  for (let i = 0; i < 3; i++) await add.click();

  await page.getByRole('button', { name: 'Parts list…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Parts list' });
  await expect(dialog.getByText(/uses 3 real LEGO pieces/)).toBeVisible();
  await expect(dialog.getByText(/To buy: 3 pieces of 1 kind/)).toBeVisible();
  const have = dialog.getByLabel(/Have: Plate 2×16 4282/);
  await have.fill('1');
  await have.press('Enter');
  await expect(dialog.getByText(/To buy: 2 pieces of 1 kind/)).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download shopping list' }).click()]);
  const text = await readFile((await dl.path())!, 'utf8');
  expect(text).toMatch(/^Part,Color,Quantity\n4282,\d+,2\n$/);

  // What I have is remembered (for every project).
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Parts list…' }).click();
  await expect(page.getByRole('dialog', { name: 'Parts list' }).getByLabel(/Have: Plate 2×16 4282/)).toHaveValue('1');
});
