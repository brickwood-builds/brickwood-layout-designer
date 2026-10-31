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

  const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'BrickLink shopping list' }).click()]);
  const text = await readFile((await dl.path())!, 'utf8');
  expect(text).toMatch(/^Part,Color,Quantity\n4282,\d+,2\n$/);

  // A price gives an estimate.
  const price = dialog.getByLabel(/Price each from BrickLink: Plate 2×16 4282/);
  await price.fill('0.85');
  await price.press('Enter');
  await expect(dialog.getByRole('status', { name: 'Estimated cost' })).toContainText(/Estimated cost to buy: \$1\.70/);

  // Brickwith first: tick "Brickwith has it"; the part moves to the Brickwith list.
  await dialog.getByLabel(/Use Brickwith first/).check();
  await dialog.getByLabel(/Brickwith has it: Plate 2×16 4282/).check();
  await expect(dialog.locator('tbody tr').first()).toContainText('Brickwith');
  await expect(dialog.getByRole('button', { name: 'BrickLink shopping list' })).toBeDisabled();
  const bwPrice = dialog.getByLabel(/Price each from Brickwith: Plate 2×16 4282/);
  await bwPrice.fill('0.30');
  await bwPrice.press('Enter');
  const [bw] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Brickwith shopping list' }).click()]);
  expect(await readFile((await bw.path())!, 'utf8')).toBe('Part,Brickwith part,Name,Colour,Quantity,Price each\n4282,4282,Plate 2×16,Light Bluish Gray,2,0.3\n');

  // Money spent.
  await dialog.getByText(/Money spent on this layout/).click();
  await dialog.getByLabel('Where').fill('Brickwith');
  await dialog.getByLabel('Amount').fill('12.50');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByText(/Money spent on this layout: \$12\.50/)).toBeVisible();

  // What I have, prices and Brickwith parts are remembered; the setting is saved with the layout.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Parts list…' }).click();
  const again = page.getByRole('dialog', { name: 'Parts list' });
  await expect(again.getByLabel(/Have: Plate 2×16 4282/)).toHaveValue('1');
  await expect(again.getByLabel(/Use Brickwith first/)).toBeChecked();
  await expect(again.getByLabel(/Brickwith has it: Plate 2×16 4282/)).toBeChecked();
});
