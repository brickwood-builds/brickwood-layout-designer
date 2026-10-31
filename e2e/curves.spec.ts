import { expect, test, type Page } from '@playwright/test';

// Phase 2: editable curves — a curved walkway that can be reshaped by dragging handles.
type Obj = { id: string; name: string; x: number; y: number };
type St = {
  project: { objects: Obj[]; modules: { label: string; x: number; y: number }[]; groups: { id: string; name: string; memberIds: string[] }[]; curves: { points: { x: number; y: number }[] }[] };
};
type Hook = { state(): St; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state()) as Promise<St>;
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);
const plates = async (page: Page) => (await st(page)).project.objects.filter((o) => o.name === 'Plate Round 1×1');

async function openPark(page: Page) {
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  const c05 = (await st(page)).project.modules.find((m) => m.label === 'C-05')!;
  const c = await at(page, c05.x + 16, c05.y + 16);
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -200);
  return c05;
}

test('draw a curved walkway, then reshape it by dragging a handle', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  const c05 = await openPark(page);
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await page.getByRole('button', { name: 'Curve' }).click();
  for (const [x, y] of [[3, 24], [16, 6], [29, 24]] as const) {
    const q = await at(page, c05.x + x, c05.y + y);
    await page.mouse.click(q.x, q.y);
  }
  await expect(page.getByText('3 points so far.')).toBeVisible();
  const end = await at(page, c05.x + 29, c05.y + 24);
  await page.mouse.dblclick(end.x, end.y); // finishing on the last point doesn't add a duplicate
  const laid = await plates(page);
  expect(laid.length).toBeGreaterThan(40);
  let s = await st(page);
  expect(s.project.groups.find((g) => g.name === 'Curve of Plate Round 1×1')?.memberIds).toHaveLength(laid.length);
  expect(s.project.curves[0]!.points).toHaveLength(3);
  // The top of the arch is near y=6.
  expect(Math.min(...laid.map((o) => o.y)) - c05.y).toBeLessThanOrEqual(7);

  // Select it and reshape: drag the top handle down to make the arch flatter.
  await page.keyboard.press('v');
  const piece = laid.find((o) => Math.abs(o.x - (c05.x + 16)) < 1 && o.y - c05.y < 8)!;
  const pp = await at(page, piece.x + 0.5, piece.y + 0.5);
  await page.mouse.click(pp.x, pp.y);
  await page.getByRole('button', { name: 'Edit curve' }).click();
  const top = await at(page, c05.x + 16, c05.y + 6);
  const lower = await at(page, c05.x + 16, c05.y + 18);
  await page.mouse.move(top.x, top.y);
  await page.mouse.down();
  await page.mouse.move(lower.x, lower.y, { steps: 5 });
  await page.mouse.up();
  const after = await plates(page);
  expect(Math.min(...after.map((o) => o.y)) - c05.y).toBeGreaterThanOrEqual(15);
  s = await st(page);
  expect(s.project.groups.filter((g) => g.name.startsWith('Curve of'))).toHaveLength(1);
  expect(s.project.curves[0]!.points[1]).toEqual({ x: c05.x + 16, y: c05.y + 18 });
  await expect(page.getByRole('button', { name: 'Done editing' })).toBeVisible();
  // One undo puts the arch back.
  await page.keyboard.press('Control+z');
  expect(Math.min(...(await plates(page)).map((o) => o.y)) - c05.y).toBeLessThanOrEqual(7);
});

test('Escape drops an unfinished curve', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  const c05 = await openPark(page);
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await page.getByRole('button', { name: 'Curve' }).click();
  const q = await at(page, c05.x + 4, c05.y + 4);
  await page.mouse.click(q.x, q.y);
  await expect(page.getByText('1 point so far.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('No points yet.')).toBeVisible();
  expect(await plates(page)).toHaveLength(0);
});

test('draw a curve with taps on the iPad and finish with the button', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad-touch', 'iPad');
  const c05 = await openPark(page);
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await page.getByRole('button', { name: 'Curve' }).click();
  const cdp = await page.context().newCDPSession(page);
  for (const [x, y] of [[4, 20], [16, 8], [28, 20]] as const) {
    const q = await at(page, c05.x + x, c05.y + y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.x, y: q.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await expect(page.getByText('3 points so far.')).toBeVisible();
  await page.getByRole('button', { name: 'Finish curve' }).click();
  expect((await plates(page)).length).toBeGreaterThan(30);
});
