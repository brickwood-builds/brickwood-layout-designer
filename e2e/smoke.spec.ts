import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const PARK = 'Brickwood Adventure Park';
const KINGDOM = 'Brickwood Kingdom (Village)';

const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true });

async function cardAction(page: Page, name: string, action: string) {
  await card(page, name).locator('summary', { hasText: 'More' }).click();
  await card(page, name).getByRole('button', { name: action }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(card(page, PARK)).toBeVisible();
});

test('first run shows both starter displays with overhead previews', async ({ page }) => {
  await expect(card(page, KINGDOM)).toBeVisible();
  await expect(card(page, PARK)).toContainText('92 modules');
  await expect(card(page, PARK)).toContainText('15 ft 6 in × 3 ft 6 in table');
  await expect(card(page, KINGDOM)).toContainText('8 ft × 3 ft 6 in table');
  await expect(card(page, PARK).locator('svg rect.pv-module')).toHaveCount(92);
});

test('open a project in the editor and survive a browser reload', async ({ page }) => {
  await card(page, PARK).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('heading', { name: PARK })).toBeVisible();
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await expect(page.getByText('92 modules')).toBeVisible();
  await expect(page.getByRole('button', { name: 'No warnings' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: PARK })).toBeVisible();
  await page.getByRole('button', { name: '← Projects' }).click();
  await expect(card(page, KINGDOM)).toBeVisible();
});

test('create, rename, duplicate and archive persist across reload', async ({ page }) => {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Library Show');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(card(page, 'Library Show')).toContainText('0 modules');

  await cardAction(page, 'Library Show', 'Rename…');
  await page.getByRole('textbox', { name: 'Name' }).fill('Library Show 2027');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await cardAction(page, 'Library Show 2027', 'Duplicate');
  await expect(card(page, 'Library Show 2027 (copy)')).toBeVisible();

  await cardAction(page, 'Library Show 2027 (copy)', 'Archive');
  await expect(card(page, 'Library Show 2027 (copy)')).toHaveCount(0);

  await page.reload();
  await expect(card(page, 'Library Show 2027')).toBeVisible();
  await expect(card(page, 'Library Show 2027 (copy)')).toHaveCount(0);
  await page.getByLabel('Show archived').check();
  await expect(card(page, 'Library Show 2027 (copy)')).toContainText('archived');
});

test('new project from a starter copies the Kingdom layout', async ({ page }) => {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Kingdom 2027');
  await page.getByRole('radio', { name: KINGDOM }).check();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(card(page, 'Kingdom 2027')).toContainText('39 modules');
});

test('export, re-import as copy, and reject an invalid file', async ({ page }, testInfo) => {
  const downloadPromise = page.waitForEvent('download');
  await cardAction(page, KINGDOM, 'Export file');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('brickwood-kingdom-village.brickwood.json');
  const exported = testInfo.outputPath('kingdom.brickwood.json');
  await download.saveAs(exported);

  await page.getByTestId('import-input').setInputFiles(exported);
  await expect(page.getByRole('status')).toContainText('imported as a copy');
  await expect(card(page, `${KINGDOM} (imported)`)).toContainText('39 modules');

  const bad = testInfo.outputPath('bad.json');
  writeFileSync(bad, '{"format":"brickwood-layout-project","formatVersion":1,"project":{"schemaVersion":1}}');
  await page.getByTestId('import-input').setInputFiles(bad);
  await expect(page.getByRole('alert')).toContainText('damaged or incomplete');
});

test('checkpoint preview and restore', async ({ page }) => {
  await cardAction(page, PARK, 'Rename…');
  await page.getByRole('textbox', { name: 'Name' }).fill('Oops wrong name');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();

  await cardAction(page, 'Oops wrong name', 'Checkpoints…');
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Automatic checkpoint').locator('..').getByRole('button').click();
  await expect(dialog.locator('svg rect.pv-module')).toHaveCount(92);
  await dialog.getByRole('button', { name: 'Restore this version' }).click();
  await expect(card(page, PARK)).toBeVisible();
  await expect(card(page, 'Oops wrong name')).toHaveCount(0);
});
