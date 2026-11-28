import { expect, test, type Page } from '@playwright/test';

// Pick a piece once, then click where each one goes; pick another to switch (22 Nov 2026).
type Obj = { id: string; name: string; x: number; y: number; width: number; depth: number };
type Hook = { state(): { project: { objects: Obj[] }; holding: { label: string } | null; view: { x: number } }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state();
  return { objects: s.project.objects, holding: s.holding?.label ?? null, viewX: s.view.x };
});
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('pick a piece, click to put down several, switch pieces, stop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/classic.html');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByText('Single pieces', { exact: true }).click();

  // Pick Plate 2×2: nothing is added yet; it is shown as held.
  const plate = page.getByRole('button', { name: 'Plate 2×2', exact: true });
  await plate.click();
  await expect(plate).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Placing Plate 2×2' })).toBeVisible();
  expect((await st(page)).objects).toHaveLength(0);

  // Three clicks: three plates, each centred where it was clicked.
  for (const [x, y] of [[10, 10], [20, 10], [30, 10]] as const) {
    const q = await at(page, x, y);
    await page.mouse.click(q.x, q.y);
  }
  let s = await st(page);
  expect(s.objects.filter((o) => o.name === 'Plate 2×2').map((o) => [o.x, o.y])).toEqual([[9, 9], [19, 9], [29, 9]]);

  // Clicking on top of a plate puts another down there (pieces stack), it doesn't select.
  const onTop = await at(page, 10, 10);
  await page.mouse.click(onTop.x, onTop.y);
  expect((await st(page)).objects.filter((o) => o.name === 'Plate 2×2')).toHaveLength(4);

  // Dragging on the table moves the view, and puts nothing down.
  const before = await st(page);
  const a = await at(page, 40, 20);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 80, a.y, { steps: 6 });
  await page.mouse.up();
  s = await st(page);
  expect(s.objects).toHaveLength(before.objects.length);
  expect(s.viewX).not.toBe(before.viewX);

  // Pick another piece: now that one goes down.
  await page.getByRole('button', { name: 'Brick 2×4', exact: true }).click();
  await expect(plate).toHaveAttribute('aria-pressed', 'false');
  const b = await at(page, 10, 20);
  await page.mouse.click(b.x, b.y);
  expect((await st(page)).objects.filter((o) => o.name === 'Brick 2×4')).toHaveLength(1);

  // Escape stops; clicking the table then just selects.
  await page.keyboard.press('Escape');
  expect((await st(page)).holding).toBeNull();
  const count = (await st(page)).objects.length;
  await page.mouse.click(b.x, b.y);
  expect((await st(page)).objects).toHaveLength(count);

  // Clicking a held entry again puts it back too.
  await plate.click();
  await plate.click();
  expect((await st(page)).holding).toBeNull();
  // Done in the bar stops as well.
  await plate.click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect((await st(page)).holding).toBeNull();
});
