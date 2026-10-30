import { expect, test, type Page } from '@playwright/test';

const PARK = 'Brickwood Adventure Park';

type Pt = { x: number; y: number };
type ModuleInfo = { id: string; label: string; x: number; y: number; width: number; depth: number; rotation: number };
/** The parts of the editor's test hook (see Canvas.tsx) these tests read. */
type Hook = {
  toPage(x: number, y: number): Pt;
  state(): { selection: string[]; view: { scale: number; x: number; y: number }; project: { modules: ModuleInfo[] } };
};

async function openPark(page: Page) {
  await page.goto('/');
  await page.getByRole('article', { name: PARK, exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('canvas').locator('canvas').first()).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
}

const toPage = (page: Page, x: number, y: number): Promise<Pt> =>
  page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

const mod = (page: Page, label: string): Promise<ModuleInfo | undefined> =>
  page.evaluate((l) => {
    const m = (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().project.modules.find((m) => m.label === l);
    return m && { id: m.id, label: m.label, x: m.x, y: m.y, width: m.width, depth: m.depth, rotation: m.rotation };
  }, label);

const editorState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state();
    return { selection: s.selection, view: s.view, modules: s.project.modules.length };
  });

async function centerOf(page: Page, label: string): Promise<Pt> {
  const m = (await mod(page, label))!;
  return toPage(page, m.x + m.width / 2, m.y + m.depth / 2);
}

async function mouseDrag(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

const saved = (page: Page) => expect(page.locator('.save-state')).toHaveText('Saved');

test.describe('mouse (desktop Chrome)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'chrome-desktop', 'mouse tests run on desktop');
    await openPark(page);
  });

  test('drag a module onto the empty end of the table; it snaps, saves and survives reload', async ({ page }) => {
    await mouseDrag(page, await centerOf(page, 'C-05'), await toPage(page, 496.3, 56.4));
    expect(await mod(page, 'C-05')).toMatchObject({ x: 480, y: 40 });
    await expect(page.getByRole('button', { name: 'No warnings' })).toBeVisible();
    await saved(page);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: Hook }).__brickwoodEditor?.state().project.modules.length);
    expect(await mod(page, 'C-05')).toMatchObject({ x: 480, y: 40 });
  });

  test('snapping stays on whole studs at any zoom', async ({ page }) => {
    const c = await centerOf(page, 'C-11');
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -200);
    await page.mouse.move(c.x, c.y);
    const zoomed = await editorState(page);
    const from = await centerOf(page, 'C-11');
    await mouseDrag(page, from, { x: from.x + zoomed.view.scale * 3.4, y: from.y + zoomed.view.scale * 0.3 });
    const after = (await mod(page, 'C-11'))!;
    expect(Number.isInteger(after.x) && Number.isInteger(after.y)).toBe(true);
    await page.getByRole('button', { name: 'Fit' }).click();
    const from2 = await centerOf(page, 'C-11');
    await mouseDrag(page, from2, { x: from2.x - 7, y: from2.y + 3 });
    const after2 = (await mod(page, 'C-11'))!;
    expect(Number.isInteger(after2.x) && Number.isInteger(after2.y)).toBe(true);
  });

  test('select shows properties; MILS ID validation; undo', async ({ page }) => {
    await page.mouse.click(...xy(await centerOf(page, 'C-05')));
    const id = page.getByLabel('ID (on back of plate)');
    await expect(id).toHaveValue('C-05');
    await id.fill('C-06');
    await id.press('Enter');
    await expect(page.getByRole('alert')).toContainText('already used');
    await id.fill('B-24');
    await id.press('Enter');
    await expect(page.getByRole('alert')).toContainText('retired');
    await id.fill('C-30');
    await id.press('Enter');
    await expect.poll(() => mod(page, 'C-30')).toBeTruthy();
    await page.keyboard.press('Control+z');
    await expect.poll(() => mod(page, 'C-05')).toBeTruthy();
    await expect(id).toHaveValue('C-05');
  });

  test('keyboard: nudge, rotate, delete, undo and redo', async ({ page }) => {
    const a = (await mod(page, 'A-01'))!;
    await page.mouse.click(...xy(await centerOf(page, 'A-01')));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await mod(page, 'A-01')).toMatchObject({ x: a.x - 10, y: a.y - 1 });
    await page.keyboard.press('r');
    expect((await mod(page, 'A-01'))!.rotation).toBe(90);
    await page.keyboard.press('Delete');
    expect(await mod(page, 'A-01')).toBeUndefined();
    await expect(page.getByText('91 modules')).toBeVisible();
    await page.keyboard.press('Control+z');
    expect((await mod(page, 'A-01'))!.rotation).toBe(90);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await mod(page, 'A-01')).toMatchObject({ x: a.x, y: a.y, rotation: 0 });
    await page.keyboard.press('Control+Shift+z');
    expect(await mod(page, 'A-01')).toMatchObject({ x: a.x, y: a.y - 1 });
  });

  test('add from the palette gets the next free ID, never a stored plate ID', async ({ page }) => {
    await page.getByRole('button', { name: '16×16', exact: true }).click();
    await expect(page.getByLabel('ID (on back of plate)')).toHaveValue('B-61');
    await expect(page.getByText('93 modules')).toBeVisible();
    await expect(page.getByRole('button', { name: 'No warnings' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('92 modules')).toBeVisible();
  });

  test('marquee selects several; delete and undo as one step', async ({ page }) => {
    const b01 = (await mod(page, 'B-01'))!;
    await mouseDrag(page, await toPage(page, -2, b01.y - 20), await toPage(page, b01.x + 40, b01.y + 8));
    const { selection } = await editorState(page);
    expect(selection.length).toBeGreaterThan(2);
    await expect(page.getByRole('heading', { name: `${selection.length} selected` })).toBeVisible();
    await page.keyboard.press('Delete');
    const left = (await editorState(page)).modules;
    expect(left).toBeLessThan(92);
    await expect(page.getByText(`${left} modules`)).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(page.getByText('92 modules')).toBeVisible();
    // Clicking empty space clears the selection.
    await page.mouse.click(...xy(await toPage(page, -3, -3)));
    expect((await editorState(page)).selection).toEqual([]);
  });

  test('overlap warning while dragging, listed afterwards, gone after undo', async ({ page }) => {
    await mouseDrag(page, await centerOf(page, 'C-05'), await centerOf(page, 'C-06'));
    const button = page.getByRole('button', { name: /1 warning/ });
    await expect(button).toBeVisible();
    await button.click();
    await page.getByRole('button', { name: 'C-05 overlaps C-06' }).click();
    expect((await editorState(page)).selection).toHaveLength(2);
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('button', { name: 'No warnings' })).toBeVisible();
  });

  test('pan mode moves the view, not the modules; wheel zooms; Fit restores', async ({ page }) => {
    const start = await editorState(page);
    const before = (await mod(page, 'C-05'))!;
    await page.getByRole('button', { name: 'Pan', exact: true }).click();
    await mouseDrag(page, await centerOf(page, 'C-05'), { ...(await centerOf(page, 'C-05')), x: (await centerOf(page, 'C-05')).x + 120 });
    const panned = await editorState(page);
    expect(panned.view.x).toBeCloseTo(start.view.x + 120, 0);
    expect(await mod(page, 'C-05')).toMatchObject({ x: before.x, y: before.y });
    await page.mouse.wheel(0, -300);
    expect((await editorState(page)).view.scale).toBeGreaterThan(start.view.scale);
    await page.getByRole('button', { name: 'Fit' }).click();
    expect((await editorState(page)).view.scale).toBeCloseTo(start.view.scale, 5);
  });

  test('add a shelf level, place a module on it, overview of both, survives reload', async ({ page }) => {
    await page.getByRole('button', { name: '+ Level' }).click();
    await page.getByLabel('Level name').fill('Upper shelf');
    await page.getByLabel('Table width (in)').fill('96');
    await page.getByLabel('Table depth (in)').fill('12');
    await page.getByRole('button', { name: 'Add level' }).click();
    await expect(page.getByLabel('Level')).toHaveValue(/.+/);
    await expect(page.getByText('0 modules')).toBeVisible();
    await page.getByRole('button', { name: '32×32', exact: true }).click();
    await expect(page.getByText('1 module', { exact: true })).toBeVisible();
    await page.getByLabel('Others').check();
    await page.getByLabel('Level').selectOption({ label: 'Main table' });
    await expect(page.getByText('92 modules')).toBeVisible();
    await saved(page);
    await page.reload();
    await expect(page.getByLabel('Level').locator('option')).toHaveText(['Main table', 'Upper shelf']);
  });
});

test.describe('touch (iPad viewport)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'ipad-touch', 'touch tests run on the iPad project');
    await openPark(page);
  });

  async function touch(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
    return {
      async drag(from: Pt, to: Pt) {
        await send('touchStart', [from]);
        for (let i = 1; i <= 10; i++) await send('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 }]);
        await send('touchEnd', []);
      },
      async tap(at: Pt) {
        await send('touchStart', [at]);
        await send('touchEnd', []);
      },
      async pinch(center: Pt, from: number, to: number) {
        const pts = (d: number) => [{ x: center.x - d, y: center.y }, { x: center.x + d, y: center.y }];
        await send('touchStart', pts(from));
        for (let i = 1; i <= 10; i++) await send('touchMove', pts(from + ((to - from) * i) / 10));
        await send('touchEnd', []);
      },
    };
  }

  test('tap selects, finger-drag moves a module with snapping', async ({ page }) => {
    const t = await touch(page);
    await t.tap(await centerOf(page, 'C-05'));
    expect((await editorState(page)).selection).toEqual([(await mod(page, 'C-05'))!.id]);
    await t.drag(await centerOf(page, 'C-05'), await toPage(page, 496.3, 56.4));
    expect(await mod(page, 'C-05')).toMatchObject({ x: 480, y: 40 });
    await saved(page);
  });

  test('finger-drag on empty space pans; tap on empty clears selection; pinch zooms', async ({ page }) => {
    const t = await touch(page);
    await t.tap(await centerOf(page, 'C-05'));
    const start = await editorState(page);
    const empty = await toPage(page, 300, -12); // above the table, clear of the floating panel
    await t.drag(empty, { x: empty.x - 100, y: empty.y });
    const panned = await editorState(page);
    expect(panned.view.x).toBeCloseTo(start.view.x - 100, 0);
    expect(panned.selection).toHaveLength(1); // a pan doesn't clear the selection
    await t.tap(await toPage(page, 300, -12));
    expect((await editorState(page)).selection).toEqual([]);
    await t.pinch(await toPage(page, 300, 60), 40, 120);
    const zoomed = await editorState(page);
    expect(zoomed.view.scale).toBeGreaterThan(start.view.scale * 2.5);
  });
});

function xy(p: Pt): [number, number] {
  return [p.x, p.y];
}
