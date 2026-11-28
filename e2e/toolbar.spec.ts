import { expect, test, type Page } from '@playwright/test';

// Erase, Copy and Paste in the toolbar (23 Nov 2026).
type Obj = { id: string; name: string; x: number; y: number };
type Hook = { state(): { project: { objects: Obj[] }; selection: string[]; mode: string; draw: { erase: boolean } }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state();
  return { objects: s.project.objects, selection: s.selection, mode: s.mode, erase: s.draw.erase };
});
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('copy and paste from the toolbar, then erase from the toolbar', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/classic.html');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  const copy = page.getByRole('button', { name: 'Copy', exact: true });
  const pasteBtn = page.getByRole('button', { name: 'Paste', exact: true });
  await expect(copy).toBeDisabled();
  await expect(pasteBtn).toBeDisabled();

  // A brick to copy. Picking it must not change the toolbar's height (the table would jump
  // and clicks land in the wrong place).
  await page.getByText('Single pieces', { exact: true }).click();
  const toolbarHeight = () => page.locator('header.toolbar').evaluate((e) => e.getBoundingClientRect().height);
  const h = await toolbarHeight();
  await page.getByRole('button', { name: 'Brick 2×4', exact: true }).click();
  expect(await toolbarHeight()).toBe(h);
  const a = await at(page, 10, 10);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.press('Escape');
  await page.mouse.click(a.x, a.y); // select it
  expect((await st(page)).selection).toHaveLength(1);

  // Copy, Paste, then click twice: two copies, where clicked.
  await copy.click();
  await pasteBtn.click();
  await expect(pasteBtn).toHaveAttribute('aria-pressed', 'true');
  for (const [x, y] of [[30, 10], [50, 10]] as const) {
    const q = await at(page, x, y);
    await page.mouse.click(q.x, q.y);
  }
  await page.keyboard.press('Escape');
  let s = await st(page);
  expect(s.objects.filter((o) => o.name === 'Brick 2×4').map((o) => [o.x, o.y])).toEqual([[8, 9], [28, 9], [48, 9]]);

  // Erase is one click away; it shows its own short panel. Rub out the middle brick.
  await page.getByRole('button', { name: 'Erase', exact: true }).click();
  s = await st(page);
  expect(s.mode).toBe('draw');
  expect(s.erase).toBe(true);
  await expect(page.getByRole('heading', { name: 'Erase' })).toBeVisible();
  await page.getByRole('group', { name: 'Eraser width (studs)' }).getByRole('button', { name: '4', exact: true }).click();
  const from = await at(page, 30, 7);
  const to = await at(page, 30, 13);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  s = await st(page);
  expect(s.objects.filter((o) => o.name === 'Brick 2×4').map((o) => o.x)).toEqual([8, 48]);

  // Draw goes back to painting.
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  expect((await st(page)).erase).toBe(false);
  await expect(page.getByRole('heading', { name: 'Draw' })).toBeVisible();
});
