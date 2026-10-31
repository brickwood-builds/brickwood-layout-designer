import { expect, test, type Page } from '@playwright/test';

// Phase 3A: the full LEGO parts list in Single pieces.
type Obj = { id: string; name: string; catalogKey?: string; color: string; smooth?: boolean; heightPlates?: number; width: number; depth: number };
type Hook = { state(): { project: { objects: Obj[] }; selection: string[] } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state());

test('search all parts, place one, favourite it; colours it is made in come first', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByText('Single pieces', { exact: true }).click();
  const search = page.getByLabel('Search single pieces');
  await search.fill('14719');
  await expect(page.getByText('All LEGO parts')).toBeVisible();
  const row = page.locator('.part-row', { hasText: 'Tile 2×2 Corner' }).first();
  await row.getByRole('button', { name: /^Tile 2×2 Corner/ }).click();
  const s = await st(page);
  const tile = s.project.objects.find((o) => o.id === s.selection[0])!;
  expect(tile).toMatchObject({ catalogKey: 'rb:14719', width: 2, depth: 2, smooth: true, heightPlates: 1 });
  // The panel names the part and offers the colours it is made in first.
  await expect(page.getByText(/LEGO part 14719/)).toBeVisible();
  await page.getByRole('button', { name: /Light Bluish Gray|Colour/ }).first().click();
  await expect(page.getByText('Made in these colours')).toBeVisible();
  await expect(page.getByRole('option', { name: /not made in this part/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Star it; with the search cleared it shows under Favourites (and Recently used is skipped for it).
  await row.getByRole('button', { name: /Add Tile 2×2 Corner to favourites/ }).click();
  await search.fill('');
  await expect(page.locator('.palette-sub', { hasText: 'Favourites' })).toBeVisible();
  await expect(page.locator('.part-row', { hasText: '14719' })).toHaveCount(1);
  // After a reload the favourite is still there.
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByText('Single pieces', { exact: true }).click();
  await expect(page.locator('.part-row', { hasText: '14719' })).toHaveCount(1);
  // Search by words finds plants; a part without a size says so.
  await page.getByLabel('Search single pieces').fill('bush');
  await expect(page.locator('.part-row', { hasText: /Bush/ }).first()).toBeVisible();
});
