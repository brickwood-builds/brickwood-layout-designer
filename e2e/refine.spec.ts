import { expect, test, type Page } from '@playwright/test';

const PARK = 'Brickwood Adventure Park';
type Pt = { x: number; y: number };
type Hook = { toPage(x: number, y: number): Pt; state(): { selection: string[]; project: { modules: { id: string; label: string; x: number; y: number; width: number; depth: number }[]; dimensions: unknown[] } } };
const hook = (page: Page) => ({
  toPage: (x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const),
  selection: () => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().selection),
  dimensions: () => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state().project.dimensions.length),
  center: (label: string) =>
    page.evaluate((l) => {
      const e = (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor;
      const m = e.state().project.modules.find((m) => m.label === l)!;
      return e.toPage(m.x + m.width / 2, m.y + m.depth / 2);
    }, label),
});

async function openPark(page: Page) {
  await page.goto('/');
  await page.getByRole('article', { name: PARK, exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
  await expect(page.getByText('92 modules')).toBeVisible();
}

test.describe('refinement (desktop)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'chrome-desktop', 'desktop');
    await openPark(page);
  });

  test('locking the module layer stops modules being selected; unlocking restores it', async ({ page }) => {
    const h = hook(page);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByLabel('Lock Table & modules').check();
    await page.getByRole('button', { name: 'Layers' }).click();
    const c = await h.center('C-05');
    await page.mouse.click(c.x, c.y);
    expect(await h.selection()).toEqual([]);
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByLabel('Lock Table & modules').uncheck();
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.mouse.click(c.x, c.y);
    expect(await h.selection()).toHaveLength(1);
  });

  test('measure 32 studs, keep it as a dimension, see it on the printout', async ({ page }) => {
    const h = hook(page);
    await page.getByLabel('Units').selectOption('studs');
    await page.keyboard.press('m');
    const a = await h.toPage(100.2, 140.1);
    const b = await h.toPage(132.3, 140.4);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('measure-result')).toHaveText('32 studs');
    await page.getByLabel('Label (optional)').fill('Aisle');
    await page.getByRole('button', { name: 'Keep this dimension' }).click();
    await expect(page.getByText('Aisle: 32 studs')).toBeVisible();
    expect(await h.dimensions()).toBe(1);
    await page.getByRole('button', { name: 'Print…' }).click();
    await expect(page.getByRole('heading', { name: 'Dimensions' })).toBeVisible();
    await expect(page.getByText('Aisle: 32 studs')).toBeVisible();
  });

  test('print page lists every module and downloads PNG and SVG pictures', async ({ page }) => {
    await page.getByRole('button', { name: 'Print…' }).click();
    await expect(page.getByRole('heading', { name: PARK })).toBeVisible();
    const modules = page.locator('section', { has: page.getByRole('heading', { name: 'Modules' }) }).locator('tbody tr');
    await expect(modules).toHaveCount(92);
    await expect(page.getByRole('cell', { name: 'Ferris Wheel' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '9 V' }).first()).toBeVisible();
    for (const [button, ext] of [['Download picture (PNG)', 'png'], ['Download drawing (SVG)', 'svg']] as const) {
      const dl = page.waitForEvent('download');
      await page.getByRole('button', { name: button }).click();
      const file = await dl;
      expect(file.suggestedFilename()).toBe(`brickwood-adventure-park.${ext}`);
      expect((await file.createReadStream()).readable).toBe(true);
    }
    await page.getByRole('button', { name: '← Back to editor' }).click();
    await expect(page.getByText('92 modules')).toBeVisible();
  });

  test('help opens on the right topic, searches, and closes', async ({ page }) => {
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Help' });
    await expect(help.getByRole('heading', { name: 'Adding and moving modules' })).toBeVisible();
    await help.getByLabel('Search help').fill('checkpoint');
    await help.getByRole('button', { name: 'Saving, backups and recovery' }).click();
    await expect(help.getByRole('heading', { name: 'Saving, backups and recovery' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    await page.getByRole('button', { name: 'Measure' }).click();
    await page.getByRole('button', { name: 'Help' }).click();
    await expect(page.getByRole('dialog', { name: 'Help' }).getByRole('heading', { name: 'Measuring' })).toBeVisible();
  });
});

test('works offline after the first visit', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'chrome-desktop', 'desktop');
  await page.goto('/');
  await expect(page.getByRole('article', { name: PARK, exact: true })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('article', { name: PARK, exact: true })).toBeVisible();
  await page.getByRole('article', { name: PARK, exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByText('92 modules')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
  await context.setOffline(false);
});
