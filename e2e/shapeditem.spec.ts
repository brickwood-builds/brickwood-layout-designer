import { expect, test, type Page } from '@playwright/test';

// Drawing the shape of a small item (25 Nov 2026).
type Obj = { id: string; name: string; type: string; outline?: { x: number; y: number }[] };
type Hook = { state(): { project: { objects: Obj[]; shapes: { name: string; outline?: unknown[] }[] } }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().project);
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('draw an L-shaped small item, then place another from Small items', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByRole('button', { name: 'Fit' }).click();

  await page.getByText('Small items', { exact: true }).click();
  await page.getByRole('button', { name: '+ Draw a shape…' }).click();
  await expect(page.getByRole('button', { name: 'A small item' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Item name').fill('Corner bench');
  for (const [x, y] of [[20, 20], [32, 20], [32, 24], [24, 24], [24, 30], [20, 30]] as const) {
    const q = await at(page, x, y);
    await page.mouse.click(q.x, q.y);
  }
  await page.getByRole('button', { name: 'Finish shape' }).click();
  let p = await st(page);
  const bench = p.objects.find((o) => o.name === 'Corner bench')!;
  expect(bench).toMatchObject({ type: 'item' });
  expect(bench.outline).toHaveLength(6);
  expect(p.shapes.find((s) => s.name === 'Corner bench')?.outline).toHaveLength(6);

  // It's in Small items: pick it and click to put another down.
  await page.getByRole('button', { name: 'Corner bench', exact: true }).click();
  const q = await at(page, 50, 26);
  await page.mouse.click(q.x, q.y);
  await page.keyboard.press('Escape');
  p = await st(page);
  expect(p.objects.filter((o) => o.name === 'Corner bench').every((o) => o.outline?.length === 6)).toBe(true);
  expect(p.objects.filter((o) => o.name === 'Corner bench')).toHaveLength(2);
  await page.screenshot({ path: 'test-results/shaped-items.png' });
});
