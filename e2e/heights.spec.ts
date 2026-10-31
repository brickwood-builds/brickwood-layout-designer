import { expect, test, type Page } from '@playwright/test';

// Phase 2A: heights, automatic stacking, stack view, height filter, shelf clearance.
type St = {
  selection: string[];
  project: {
    features: { heights: boolean };
    modules: { id: string; label: string; name: string; x: number; y: number; width: number; depth: number; heightPlates?: number }[];
    objects: { id: string; name: string; x: number; y: number; width: number; depth: number }[];
  };
};
type Hook = { state(): St; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state()) as Promise<St>;
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

async function openPark(page: Page) {
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
}

async function drop(page: Page, button: string, x: number, y: number) {
  const btn = page.getByRole('button', { name: button, exact: true });
  await btn.scrollIntoViewIfNeeded();
  const box = (await btn.boundingBox())!;
  const to = await at(page, x, y);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test.describe('heights (desktop)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'chrome-desktop', 'desktop');
    await openPark(page);
  });

  test('heights stay hidden until switched on', async ({ page }) => {
    await page.getByText('Ferris Wheel').first().waitFor({ state: 'detached' }).catch(() => undefined);
    const ferris = (await st(page)).project.modules.find((m) => m.name === 'Ferris Wheel')!;
    const c = await at(page, ferris.x + 20, ferris.y + 20);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByRole('heading', { name: 'Feature (on its own base)' })).toBeVisible();
    await expect(page.getByLabel('Height', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Show up to')).toHaveCount(0);
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByLabel('Heights').check();
    await page.getByRole('button', { name: 'More tools' }).click();
    await expect(page.getByLabel('Height', { exact: true })).toBeVisible();
    await expect(page.getByText('Show up to')).toBeVisible();
    expect((await st(page)).project.features.heights).toBe(true);
  });

  test('set a ride height in inches; a brick on a plate stacks on top; the filter hides it', async ({ page }) => {
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByLabel('Heights').check();
    await page.getByRole('button', { name: 'More tools' }).click();

    // Ferris Wheel 12 in tall.
    const ferris = (await st(page)).project.modules.find((m) => m.name === 'Ferris Wheel')!;
    const fc = await at(page, ferris.x + 20, ferris.y + 20);
    await page.mouse.click(fc.x, fc.y);
    await page.getByLabel('Height', { exact: true }).fill('12 in');
    await page.getByLabel('Height', { exact: true }).press('Enter');
    await expect(page.getByText('95 plates (12.0 in)').first()).toBeVisible();
    expect((await st(page)).project.modules.find((m) => m.name === 'Ferris Wheel')!.heightPlates).toBe(95);

    // A plate on C-05, then a brick on the plate.
    const c05 = (await st(page)).project.modules.find((m) => m.label === 'C-05')!;
    await page.getByText('Single pieces', { exact: true }).click();
    await drop(page, 'Plate 4×4', c05.x + 10, c05.y + 10);
    await drop(page, 'Brick 2×2', c05.x + 10, c05.y + 10);
    await expect(page.getByRole('heading', { name: 'Single piece' })).toBeVisible();
    await expect(page.getByText(/Sits at 1 plate .*, on Plate 4×4/)).toBeVisible();
    const stack = page.locator('.stack-list li');
    await expect(stack).toHaveCount(3);
    await expect(stack.nth(0)).toContainText('C-05');
    await expect(stack.nth(2)).toContainText('Brick 2×2');

    // Height filter at 1 plate: the brick (sitting at 1) is hidden, so a click there finds the plate.
    const slider = page.getByLabel('Show things that sit below this height');
    await slider.fill('1');
    await expect(page.getByText('1 plates')).toBeVisible();
    const spot = await at(page, c05.x + 10, c05.y + 10);
    await page.mouse.click(spot.x, spot.y);
    const sel = (await st(page)).selection;
    const plate = (await st(page)).project.objects.find((o) => o.name === 'Plate 4×4')!;
    expect(sel).toEqual([plate.id]);
  });

  test('a tall ride under a shelf gets a clearance warning', async ({ page }) => {
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByLabel('Heights').check();
    await page.getByRole('button', { name: 'More tools' }).click();
    const ferris = (await st(page)).project.modules.find((m) => m.name === 'Ferris Wheel')!;
    const fc = await at(page, ferris.x + 20, ferris.y + 20);
    await page.mouse.click(fc.x, fc.y);
    await page.getByLabel('Height', { exact: true }).fill('14 in');
    await page.getByLabel('Height', { exact: true }).press('Enter');
    // Shelf 12 in above the main table (main table is at 30 in).
    await page.getByRole('button', { name: 'Table…' }).click();
    await page.getByRole('button', { name: 'Add a level…' }).click();
    await page.getByLabel('Level name').fill('Upper shelf');
    await page.getByLabel('Table width (in)').fill('186');
    await page.getByLabel('Table depth (in)').fill('42');
    await page.getByLabel('Height above floor (in)').fill('42');
    await page.getByRole('button', { name: 'Add level' }).click();
    await page.getByLabel('Level', { exact: true }).selectOption({ label: 'Main table' });
    await page.getByRole('button', { name: /1 warning/ }).click();
    await expect(page.getByRole('list', { name: 'Warnings' })).toContainText('Ferris Wheel (14.0 in tall) reaches Upper shelf, which is 12.0 in above');
  });
});
