import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Phase 7: back up everything and restore with a preview; display report; read-only viewer.
const PARK = 'Brickwood Adventure Park';

test('back up everything, then restore an older project with a preview', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await expect(page.getByText('No backup yet.')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up everything' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^brickwood-backup-\d{4}-\d{2}-\d{2}\.brickwood-backup\.json$/);
  const file = await readFile((await dl.path())!, 'utf8');
  expect(JSON.parse(file)).toMatchObject({ kind: 'brickwood-backup', version: 1 });
  await expect(page.getByText(/Last backup: .*\(today\)/)).toBeVisible();

  // Rename the park, then restore the backup: the older copy is shown, not ticked by default.
  await page.getByRole('article', { name: PARK, exact: true }).getByText('More').click();
  await page.getByRole('article', { name: PARK, exact: true }).getByRole('button', { name: 'Rename…' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Park renamed');
  await page.getByRole('dialog').getByRole('button', { name: /Rename|Save/ }).click();
  await expect(page.getByRole('article', { name: 'Park renamed' })).toBeVisible();

  await page.getByLabel('Backup file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  const dialog = page.getByRole('dialog', { name: 'Restore from backup' });
  await expect(dialog.getByRole('row', { name: new RegExp(`${PARK}.*Older than here`) })).toBeVisible();
  const box = dialog.getByRole('checkbox', { name: `Restore ${PARK}` });
  await expect(box).not.toBeChecked();
  await box.check();
  await dialog.getByRole('button', { name: /^Restore 1 project$/ }).click();
  await expect(page.getByText(/Restored 1 project/)).toBeVisible();
  await expect(page.getByRole('article', { name: PARK, exact: true })).toBeVisible();
});

test('display report and a read-only view to share', async ({ page, isMobile, context }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: PARK, exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('footer.statusbar').getByText('92 modules')).toBeVisible();

  await page.getByRole('button', { name: 'More tools' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Share a read-only view…' }).click()]);
  expect(dl.suggestedFilename()).toBe(`${PARK} - view.html`);
  const html = await readFile((await dl.path())!, 'utf8');

  await page.getByRole('button', { name: 'Display report…' }).click();
  await expect(page.getByRole('heading', { name: `${PARK} — display report` })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shows (0)' })).toBeVisible();
  await page.getByRole('button', { name: '← Back to editor' }).click();
  await expect(page.locator('footer.statusbar').getByText('92 modules')).toBeVisible();

  // The viewer works on its own: find a module, see its details; there is nothing to edit.
  const viewer = await context.newPage();
  await viewer.setContent(html);
  await expect(viewer.getByRole('heading', { name: PARK })).toBeVisible();
  await expect(viewer.getByText('nothing can be changed here')).toBeVisible();
  await viewer.getByLabel('Find').fill('c-05');
  await expect(viewer.locator('.tip')).toContainText('C-05 · 32×32 studs');
  await expect(viewer.locator('.pv-thing.hit')).toHaveCount(1);
  await expect(viewer.locator('input:not([type=search]), textarea, [contenteditable]')).toHaveCount(0);
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await expect(viewer.getByRole('row', { name: /C-05/ })).toBeVisible();
});
