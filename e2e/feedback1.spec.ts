import { expect, test, type Page } from '@playwright/test';

// Owner feedback round 1: LEGO colours, 8×16, own markers/items, layers, finished look.
type Obj = { name: string; type: string; layerId: string; color: string; x: number; y: number };
type St = {
  project: {
    objects: Obj[];
    modules: { label: string; kind: string; width: number; depth: number; x: number; y: number; plateColor?: string }[];
    layers: { id: string; name: string; order: number }[];
    settings: { showLabels: boolean; moduleColors: string };
  };
};
const state = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: { state(): St } }).__brickwoodEditor.state().project) as Promise<St['project']>;

async function newBlankProject(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('testing – development');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('article', { name: 'testing – development' }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);
}

test.describe('feedback round 1 (desktop)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'chrome-desktop', 'desktop');
    await newBlankProject(page);
  });

  test('8×16 module gets an A-xx ID; toolbar shows the save time', async ({ page }) => {
    await page.getByRole('button', { name: '8×16', exact: true }).click();
    await expect(page.getByLabel('ID (on back of plate)')).toHaveValue('A-01');
    const m = (await state(page)).modules[0]!;
    expect(m).toMatchObject({ kind: '16x8', width: 8, depth: 16 });
    await expect(page.locator('.save-state')).toHaveText(/^Saved \d{1,2}:\d{2}/);
  });

  test('new marker with a LEGO colour is kept in the Setup markers list', async ({ page }) => {
    await page.getByText('Setup markers', { exact: true }).click();
    // Markers don't carry over: a new project's list is empty.
    await expect(page.locator('.palette-section', { hasText: 'Setup markers' }).getByRole('button')).toHaveText(['+ New marker…']);
    await page.getByRole('button', { name: '+ New marker…' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Name').fill('Popcorn cart');
    await dlg.getByRole('button', { name: 'White' }).click(); // opens the LEGO colour grid
    await page.getByRole('option', { name: 'Bright Light Orange' }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const objs = (await state(page)).objects;
    expect(objs).toHaveLength(1);
    expect(objs[0]).toMatchObject({ name: 'Popcorn cart', type: 'setupMarker', color: '#f8bb3d' });
    // It's in the list now; tap it to place another.
    await page.getByRole('button', { name: 'Popcorn cart', exact: true }).click();
    expect((await state(page)).objects.filter((o) => o.name === 'Popcorn cart')).toHaveLength(2);
    // The colour picker only offers LEGO colours (no gradient input).
    await expect(page.locator('input[type="color"]')).toHaveCount(0);
  });

  test('a sidewalk on the Surface details layer under a lamp: no warning; MILS IDs and finished look', async ({ page }) => {
    await page.getByRole('button', { name: '32×32', exact: true }).click();
    // Pick Surface details as the layer for new items, then draw a sidewalk.
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByLabel('New items go on Surface details').check();
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByText('Small items', { exact: true }).click();
    await page.getByRole('button', { name: '+ New item…' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Name').fill('Sidewalk');
    await dlg.getByLabel('Width (studs)').fill('16');
    await dlg.getByLabel('Depth (studs)').fill('4');
    await expect(dlg.getByLabel('Layer')).toHaveValue((await state(page)).layers.find((l) => l.name === 'Surface details')!.id);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    // Lamp goes on the markers layer.
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByLabel('New items go on Markers & small items').check();
    await page.getByRole('button', { name: 'Layers' }).click();
    // A new project has no markers of its own yet: make one.
    await page.getByText('Setup markers', { exact: true }).click();
    await page.getByRole('button', { name: '+ New marker…' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill('Lamp');
    await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
    const p = await state(page);
    const layerName = (id: string) => p.layers.find((l) => l.id === id)!.name;
    expect(p.objects.map((o) => [o.name, layerName(o.layerId)])).toEqual([
      ['Sidewalk', 'Surface details'],
      ['Lamp', 'Markers & small items'],
    ]);
    await expect(page.getByRole('button', { name: 'No warnings' })).toBeVisible();
    // Hide MILS IDs and switch on the finished look.
    await page.getByRole('button', { name: 'Layers' }).click();
    await page.getByLabel('Show MILS IDs and names').uncheck();
    await page.getByLabel('Finished look (real plate colours)').check();
    const after = await state(page);
    expect(after.settings).toMatchObject({ showLabels: false, moduleColors: 'plate' });
  });

  test('plate colour is chosen from LEGO colours in the module details', async ({ page }) => {
    await page.getByRole('button', { name: '32×32', exact: true }).click();
    await page.getByRole('button', { name: 'Not set (shown as Green)' }).click();
    await page.getByRole('option', { name: 'Dark Bluish Gray' }).click();
    expect((await state(page)).modules[0]!.plateColor).toBe('#6c6e68');
    await expect(page.getByRole('button', { name: 'Dark Bluish Gray' })).toBeVisible();
  });
});
