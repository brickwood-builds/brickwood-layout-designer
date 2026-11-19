import { expect, test, type Page } from '@playwright/test';

// Live Rebrickable lookup (decision 18 Nov 2026), against a pretend Rebrickable.
const KEY = 'abcdef0123456789abcdef0123456789';
type Obj = { id: string; catalogKey?: string; width: number; depth: number };
type Hook = { state(): { project: { objects: Obj[] }; selection: string[] } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state());

async function openEditor(page: Page) {
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByText('Single pieces', { exact: true }).click();
}

test('enter a Rebrickable key, look a part up, place it; it is still found offline later', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'desktop');
  const requests: string[] = [];
  await page.route('https://rebrickable.com/api/v3/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    if ((await route.request().headerValue('authorization')) !== `key ${KEY}`) return route.fulfill({ status: 401, json: { detail: 'Invalid token.' } });
    if (url.pathname.endsWith('/colors/')) return route.fulfill({ json: { count: 1, results: [{ id: 0, name: 'Black' }] } });
    const results = url.searchParams.get('search')?.includes('zipline')
      ? [{ part_num: '77777', name: 'Zipline Plate 3 x 5', part_cat_id: 9, external_ids: { BrickLink: ['77777b'] } }]
      : [];
    return route.fulfill({ json: { count: results.length, results } });
  });

  await page.goto('/');
  await openEditor(page);
  const search = page.getByLabel('Search single pieces');
  await search.fill('zipline');
  await expect(page.getByText('No match.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Not here? Look it up online…' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rebrickable key' });
  await dialog.getByLabel('Rebrickable API key').fill(KEY);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Look up “zipline” on Rebrickable' }).click();
  await expect(page.getByText('Found 1 on Rebrickable — kept for offline use.')).toBeVisible();
  const lookup = requests.find((r) => r.includes('search='))!;
  expect(lookup).toContain('inc_part_details=1');
  // Shown with its BrickLink number.
  const row = page.locator('.part-row', { hasText: 'Zipline Plate 3×5' });
  await expect(row).toContainText('77777b');
  await row.getByRole('button', { name: /^Zipline Plate 3×5/ }).click();
  const s = await st(page);
  expect(s.project.objects.find((o) => o.id === s.selection[0])).toMatchObject({ catalogKey: 'bl:77777b', width: 5, depth: 3 }); // stored by its BrickLink number
  await expect(page.getByText(/LEGO part 77777b on BrickLink/)).toBeVisible();

  // Later, with no internet: the looked-up part is still found.
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByText('Single pieces', { exact: true }).click();
  await page.getByLabel('Search single pieces').fill('zipline');
  await expect(page.locator('.palette-sub', { hasText: 'Looked up on Rebrickable' })).toBeVisible();
  await expect(page.locator('.part-row', { hasText: 'Zipline Plate 3×5' })).toHaveCount(1);
  await context.setOffline(false);
});

test('a wrong key is not saved', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.route('https://rebrickable.com/api/v3/**', (route) => route.fulfill({ status: 401, json: { detail: 'Invalid token.' } }));
  await page.goto('/');
  await openEditor(page);
  await page.getByLabel('Search single pieces').fill('zipline');
  await page.getByRole('button', { name: 'Not here? Look it up online…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rebrickable key' });
  await dialog.getByLabel('Rebrickable API key').fill('wrongkeywrongkeywrongkey');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('didn’t accept the key');
});
