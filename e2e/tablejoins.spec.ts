import { expect, test, type Page } from '@playwright/test';

// Marking where one table ends and the next begins (25 Nov 2026).
type Hook = { state(): { project: { levels: { tableJoins?: unknown[] }[] } }; toPage(x: number, y: number): { x: number; y: number } };
const joins = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().project.levels[0]!.tableJoins ?? []);
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('mark the joins of a U-shaped table by clicking; the dialog counts the tables', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

  // A U: 120 × 72 in, tables 30 in deep (back 0–95 studs deep; legs 95 studs wide).
  await page.getByRole('button', { name: 'Table…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Table & level' });
  await dlg.getByRole('button', { name: 'U-shape' }).click();
  await dlg.getByLabel('Table width (in)').fill('120');
  await dlg.getByLabel('Table depth (in)').fill('72');
  await dlg.getByLabel('Depth of the tables (in)').fill('30');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Fit' }).click();

  await page.getByRole('button', { name: 'Table…' }).click();
  await expect(dlg.getByText('No joins marked: shown as one table.')).toBeVisible();
  await dlg.getByRole('button', { name: 'Mark table joins…' }).click();
  await expect(page.getByTestId('tool-hint')).toContainText('where one table ends and the next begins');

  // Where each leg meets the back (clicked just below the line: it snaps onto it), and the
  // middle of the back.
  for (const [x, y] of [[40, 97], [341, 97], [190, 40]] as const) {
    const q = await at(page, x, y);
    await page.mouse.click(q.x, q.y);
  }
  expect(await joins(page)).toHaveLength(3);
  const q = await at(page, 300, 40);
  await page.mouse.move(q.x, q.y); // shows where the next one would go
  await page.screenshot({ path: 'test-results/table-joins.png' });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Table…' }).click();
  await expect(dlg.getByText('3 joins marked: 4 tables.')).toBeVisible();
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  // Clicking a join removes it.
  await page.getByRole('button', { name: 'Table…' }).click();
  await dlg.getByRole('button', { name: 'Mark table joins…' }).click();
  const mid = await at(page, 190, 40);
  await page.mouse.click(mid.x, mid.y);
  await page.keyboard.press('Escape');
  expect(await joins(page)).toHaveLength(2);
});
