import { expect, test, type Page } from '@playwright/test';

// Phase 2D: reusable designs with linked copies.
type St = {
  selection: string[];
  project: {
    designs: { id: string; name: string; version: number }[];
    groups: { id: string; name: string; memberIds: string[]; designId?: string; designVersion?: number }[];
    modules: { id: string; name: string; x: number; y: number; width: number; depth: number }[];
    objects: { id: string; name: string; color: string }[];
  };
};
type Hook = { state(): St; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state()) as Promise<St>;
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

test('save a food stand as a design, place a copy, change the design, update the copy', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Development', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

  // A food stand feature with a brick on it.
  await page.getByText('Features', { exact: true }).click();
  await page.getByRole('button', { name: 'New…' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Food stand');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  const stand = (await st(page)).project.modules.find((m) => m.name === 'Food stand')!;
  await page.getByText('Single pieces', { exact: true }).click();
  const brickBtn = page.getByRole('button', { name: 'Brick 2×2', exact: true });
  await brickBtn.scrollIntoViewIfNeeded();
  const bb = (await brickBtn.boundingBox())!;
  const on = await at(page, stand.x + 8, stand.y + 8);
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(on.x, on.y, { steps: 8 });
  await page.mouse.up();

  // Select the stand (its brick comes along) and save it as a design.
  const c = await at(page, stand.x + 24, stand.y + 24);
  await page.mouse.click(c.x, c.y);
  await page.getByRole('button', { name: 'Save as design…' }).click();
  await page.getByLabel('Design name').fill('Food stand with brick');
  await page.getByRole('button', { name: 'Save design' }).click();
  let s = await st(page);
  expect(s.project.designs.map((d) => d.name)).toEqual(['Food stand with brick']);
  expect(s.project.groups[0]!.memberIds).toHaveLength(2);

  // Place a copy from the palette.
  await page.getByText('Designs', { exact: true }).click();
  await page.locator('.palette-section', { hasText: 'Designs' }).getByRole('button', { name: /^Food stand with brick/ }).click();
  s = await st(page);
  expect(s.project.groups.filter((g) => g.designId)).toHaveLength(2);
  expect(s.project.modules.filter((m) => m.name === 'Food stand')).toHaveLength(2);
  const copy = s.project.groups.find((g) => g.memberIds.includes(s.selection[0]!))!;

  // Change the original's brick colour and push it to the design.
  const original = s.project.groups.find((g) => g.id !== copy.id)!;
  const brick1 = s.project.objects.find((o) => original.memberIds.includes(o.id))!;
  await page.evaluate((id) => (window as unknown as { __brickwoodEditor: { state(): { select(ids: string[]): void } } }).__brickwoodEditor.state().select([id]), brick1.id);
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await page.getByRole('option', { name: 'Dark Green' }).click();
  await page.mouse.click(c.x, c.y); // the stand: selects the whole original copy
  await expect(page.getByText('up to date')).toBeVisible();
  await page.getByRole('button', { name: 'Update the design from this copy' }).click();
  expect((await st(page)).project.designs[0]!.version).toBe(2);
  await expect(page.locator('.badge')).toHaveText('1');

  // The other copy offers to update; it changes only when asked.
  s = await st(page);
  const copyStand = s.project.modules.find((m) => copy.memberIds.includes(m.id))!;
  const cc = await at(page, copyStand.x + 24, copyStand.y + 24);
  await page.mouse.click(cc.x, cc.y);
  await expect(page.getByText('the design has changed')).toBeVisible();
  await page.getByRole('button', { name: 'Update this copy' }).click();
  s = await st(page);
  const g2 = s.project.groups.find((g) => g.id === copy.id)!;
  expect(g2.designVersion).toBe(2);
  expect(s.project.objects.filter((o) => g2.memberIds.includes(o.id)).map((o) => o.color)).toEqual(['#184632']);
  await expect(page.locator('.badge')).toHaveCount(0);
});
