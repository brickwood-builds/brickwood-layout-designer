import { expect, test, type Page } from '@playwright/test';

// A table that isn't a rectangle (24 Nov 2026): L, U, ring.
type T = { id: string; x: number; y: number; width: number; depth: number };
type Hook = { state(): { project: { tables: T[]; levels: { tableShape?: { kind: string } }[] } } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().project);

test('make the table a U, then a ring; the preview and the layout show the shape', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/classic.html');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

  await page.getByRole('button', { name: 'Table…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Table & level' });
  await dlg.getByRole('button', { name: 'U-shape' }).click();
  await dlg.getByLabel('Table width (in)').fill('120');
  await dlg.getByLabel('Table depth (in)').fill('72');
  await dlg.getByLabel('Depth of the tables (in)').fill('30');
  await dlg.getByLabel('Open side').selectOption('front');
  await expect(dlg.getByRole('img', { name: 'Preview: U-shape' })).toBeVisible();
  await page.screenshot({ path: 'test-results/table-dialog-u.png' });
  await dlg.getByRole('button', { name: 'Save' }).click();
  let p = await st(page);
  expect(p.tables).toHaveLength(3);
  expect(p.levels[0]!.tableShape).toMatchObject({ kind: 'U' });
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.screenshot({ path: 'test-results/table-u.png' });

  // Sizes that can't work are explained, and Save waits.
  await page.getByRole('button', { name: 'Table…' }).click();
  await expect(dlg.getByRole('button', { name: 'U-shape' })).toHaveAttribute('aria-pressed', 'true');
  await dlg.getByRole('button', { name: 'Ring (open middle)' }).click();
  await dlg.getByLabel('Depth of the tables (in)').fill('40');
  await expect(dlg.getByRole('alert')).toContainText('no open middle');
  await expect(dlg.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dlg.getByLabel('Depth of the tables (in)').fill('24');
  await dlg.getByRole('button', { name: 'Save' }).click();
  p = await st(page);
  expect(p.tables).toHaveLength(4);
  await page.getByRole('button', { name: 'Fit' }).click();
  await page.screenshot({ path: 'test-results/table-ring.png' });

  // And back to a plain rectangle.
  await page.getByRole('button', { name: 'Table…' }).click();
  await dlg.getByRole('button', { name: 'Rectangle' }).click();
  await dlg.getByRole('button', { name: 'Save' }).click();
  p = await st(page);
  expect(p.tables).toHaveLength(1);
  expect(p.levels[0]!.tableShape).toBeUndefined();
});
