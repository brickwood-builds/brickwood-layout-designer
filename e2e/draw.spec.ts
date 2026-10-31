import { expect, test, type Page } from '@playwright/test';

// Phase 2B: Draw tool — walkways of 1×1 round plates (owner's example).
type Obj = { name: string; type: string; x: number; y: number; round?: boolean; color: string; layerId: string };
type St = { project: { objects: Obj[]; modules: { label: string; x: number; y: number }[]; layers: { id: string; name: string }[] } };
type Hook = { state(): St; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state()) as Promise<St>;
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);
const plates = async (page: Page) => (await st(page)).project.objects.filter((o) => o.name === 'Plate Round 1×1');

async function openPark(page: Page) {
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  // Zoom in on C-05 so a stroke covers a sensible number of studs.
  const c05 = (await st(page)).project.modules.find((m) => m.label === 'C-05')!;
  const c = await at(page, c05.x + 16, c05.y + 16);
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -200);
  return c05;
}

test.describe('draw (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop');

  test('freehand walkway of 1×1 round plates on Surface details; one undo removes it', async ({ page }) => {
    const c05 = await openPark(page);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByLabel('New items go on Surface details').check();
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.keyboard.press('b');
    await expect(page.getByRole('heading', { name: 'Draw' })).toBeVisible();
    await expect(page.getByLabel('Draw with')).toHaveValue('part:round-1x1');
    // A 2-stud-wide stroke along the middle of C-05.
    const a = await at(page, c05.x + 2.5, c05.y + 16);
    const b = await at(page, c05.x + 29.5, c05.y + 16);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 }); // few samples: gaps must still be filled
    await page.mouse.up();
    const walk = await plates(page);
    const xs = new Set(walk.map((o) => o.x));
    expect(walk.length).toBeGreaterThanOrEqual(2 * 28);
    for (let x = c05.x + 2; x <= c05.x + 29; x++) expect(xs.has(x)).toBe(true); // no gaps
    const surface = (await st(page)).project.layers.find((l) => l.name === 'Surface details')!.id;
    expect(walk.every((o) => o.round && o.type === 'piece' && o.layerId === surface && o.color === '#e4cd9e')).toBe(true);
    await expect(page.getByRole('button', { name: 'No warnings' })).toBeVisible();
    await page.keyboard.press('Control+z');
    expect(await plates(page)).toHaveLength(0);
  });

  test('fill box, then erase part of it; the printout counts the plates', async ({ page }) => {
    const c05 = await openPark(page);
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByRole('button', { name: 'Fill box' }).click();
    await page.getByRole('button', { name: 'Tan' }).click();
    await page.getByRole('option', { name: 'Light Bluish Gray' }).click();
    const a = await at(page, c05.x + 2.2, c05.y + 2.2);
    const b = await at(page, c05.x + 12.2, c05.y + 6.2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    expect(await plates(page)).toHaveLength(11 * 5);
    // Erase a 3-wide box at the left end.
    await page.getByLabel(/Erase instead/).check();
    const e1 = await at(page, c05.x + 2.2, c05.y + 2.2);
    const e2 = await at(page, c05.x + 4.8, c05.y + 6.8);
    await page.mouse.move(e1.x, e1.y);
    await page.mouse.down();
    await page.mouse.move(e2.x, e2.y, { steps: 5 });
    await page.mouse.up();
    expect(await plates(page)).toHaveLength(8 * 5);
    await page.getByRole('button', { name: 'Print…' }).click();
    const row = page.locator('section', { has: page.getByRole('heading', { name: 'Single pieces' }) }).locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Plate Round 1×1');
    await expect(row).toContainText('Light Bluish Gray');
    await expect(row).toContainText('40');
  });
});

test('draw a walkway with a finger on the iPad', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad-touch', 'iPad');
  const c05 = await openPark(page);
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  const a = await at(page, c05.x + 4.5, c05.y + 8);
  const b = await at(page, c05.x + 20.5, c05.y + 8);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 6, y: a.y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const walk = await plates(page);
  expect(new Set(walk.map((o) => o.x)).size).toBeGreaterThanOrEqual(16);
});

test('single pieces: search the built-in parts; a made-up tile is smooth', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByText('Single pieces', { exact: true }).click();
  const search = page.getByLabel('Search single pieces');
  await search.fill('3024');
  await expect(page.locator('.palette-section', { hasText: 'Single pieces' }).getByRole('button', { name: /^Plate 1×1$/ })).toBeVisible();
  await search.fill('tile 1x6');
  await page.getByRole('button', { name: 'Tile 1×6', exact: true }).click();
  await search.fill('');
  await page.getByRole('button', { name: '+ New piece…' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Name').fill('Tile 1×10');
  await dlg.getByLabel('Width (studs)').fill('10');
  await dlg.getByLabel(/Smooth top/).check();
  await dlg.getByRole('button', { name: 'Add', exact: true }).click();
  const objs = await page.evaluate(() =>
    (window as unknown as { __brickwoodEditor: { state(): { project: { objects: { name: string; catalogKey?: string; smooth?: boolean }[] } } } }).__brickwoodEditor.state().project.objects,
  );
  expect(objs.find((o) => o.name === 'Tile 1×6')).toMatchObject({ catalogKey: 'tile-1x6' });
  expect(objs.find((o) => o.name === 'Tile 1×10')).toMatchObject({ smooth: true });
});

test('build a small hill by stacking plates, then shade by height', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByLabel('Heights').check();
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.keyboard.press('b');
  await page.getByLabel('Draw with').selectOption('part:plate-2x2');
  await page.getByRole('button', { name: 'Fill box' }).click();
  await page.getByRole('button', { name: 'Stack on top' }).click();
  const box = async (x0: number, y0: number, x1: number, y1: number) => {
    const a = await at(page, x0, y0);
    const b = await at(page, x1, y1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
  };
  await box(40.5, 40.5, 59.5, 59.5); // 10×10 plates
  await box(44.5, 44.5, 55.5, 55.5); // 6×6 on top
  await box(48.5, 48.5, 51.5, 51.5); // 2×2 on top
  const n = (await st(page)).project.objects.filter((o) => o.name === 'Plate 2×2').length;
  expect(n).toBe(100 + 36 + 4);
  await page.getByLabel('Shade by height').check();
  await expect(page.getByLabel(/Key: low \(0\) to high \(3 plates\)/)).toBeVisible();
});
