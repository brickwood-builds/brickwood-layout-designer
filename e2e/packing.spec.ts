import { expect, test, type Page } from '@playwright/test';

// Phase 5: packing (containers, labels, QR lookup) and a show (checklist, trips, record).
type Hook = { state(): { project: { id: string; modules: { id: string; label: string; x: number; y: number }[]; containers: { code: string; itemIds: string[] }[]; shows: { checklist: Record<string, { packed?: string; loaded?: string }>; done: boolean; snapshot?: { containers: { code: string }[] } }[] } }; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state());
const at = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);
const ready = (page: Page) => page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

test('pack modules into a tote, look it up by its QR address, take it to a show', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await ready(page);
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByLabel(/^Packing/).check();
  await page.getByLabel(/^Shows/).check();
  await page.getByRole('button', { name: 'More tools' }).click();

  // Select B-14 and B-15 and put them in a new tote from the panel.
  const s0 = await st(page);
  const b14 = s0.project.modules.find((m) => m.label === 'B-14')!;
  const b15 = s0.project.modules.find((m) => m.label === 'B-15')!;
  const p14 = await at(page, b14.x + 2, b14.y + 2);
  const p15 = await at(page, b15.x + 2, b15.y + 2);
  await page.mouse.click(p14.x, p14.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(p15.x, p15.y);
  await page.keyboard.up('Shift');
  await page.getByLabel('Put in').selectOption('new');
  const box = page.getByRole('dialog', { name: /BX-001/ });
  await expect(box.locator('.contents-list li').filter({ hasText: 'B-14' })).toBeVisible();
  await box.getByLabel('Name', { exact: true }).fill('Modules B');
  await box.getByLabel('Name', { exact: true }).blur();
  await box.getByLabel('Handling notes').fill('Keep flat');
  await box.getByLabel('Handling notes').blur();
  await box.getByLabel('Equipment').fill('Table skirt');
  await box.getByRole('button', { name: 'Add equipment' }).click();
  await expect(box.locator('.contents-list li').filter({ hasText: 'Table skirt' })).toBeVisible();
  expect((await st(page)).project.containers[0]!.itemIds).toEqual(expect.arrayContaining([b14.id, b15.id]));
  await box.getByRole('button', { name: '← All containers' }).click();
  await expect(page.getByRole('dialog', { name: 'Packing' }).getByRole('row', { name: /BX-001 Modules B/ })).toBeVisible();
  await page.getByRole('dialog', { name: 'Packing' }).getByRole('button', { name: 'Close' }).click();

  // The QR code's address opens the box (lookup only).
  const id = (await st(page)).project.id;
  await expect(page.locator('.save-state')).toHaveAttribute('data-state', 'saved');
  await page.goto(`/#/project/${id}/box/BX-001`);
  await page.reload();
  await ready(page);
  await expect(page.getByRole('dialog', { name: 'BX-001 Modules B' })).toBeVisible();
  await page.getByRole('dialog', { name: 'BX-001 Modules B' }).getByRole('button', { name: 'Close' }).click();

  // A show: leave the Carousel home; tick Packed for the tote; a trip; done keeps the record.
  await page.getByRole('button', { name: /^Shows/ }).click();
  const shows = page.getByRole('dialog', { name: 'Shows' });
  await shows.getByLabel('Show name').fill('BrickFair');
  await shows.getByLabel('Starts').fill('2027-08-05');
  await shows.getByLabel('Ends').fill('2027-08-08');
  await shows.getByRole('button', { name: 'Add show' }).click();
  const show = page.getByRole('dialog', { name: 'BrickFair' });
  await show.getByRole('checkbox', { name: 'Carousel', exact: true }).uncheck();
  await expect(show.getByRole('checkbox', { name: 'Packed: Carousel' })).toHaveCount(0);
  await show.getByRole('checkbox', { name: 'Packed: BX-001 Modules B' }).check();
  await show.getByLabel('Trip name').fill('Van');
  await show.getByLabel('Cargo space (cu ft)').fill('80');
  await show.getByRole('button', { name: 'Add trip' }).click();
  await show.getByLabel('Trip: BX-001 Modules B').selectOption({ label: 'Van' });
  await expect(show.getByText(/^Van: 1 item/)).toBeVisible();
  let s = (await st(page)).project.shows[0]!;
  const toteId = Object.keys(s.checklist)[0]!;
  expect(s.checklist[toteId]).toHaveProperty('packed');
  expect(s.checklist[toteId]).not.toHaveProperty('loaded');
  await show.getByRole('button', { name: 'Show done — keep the record' }).click();
  await expect(show.getByRole('heading', { name: /What went/ })).toBeVisible();
  s = (await st(page)).project.shows[0]!;
  expect(s.done).toBe(true);
  expect(s.snapshot!.containers.map((c) => c.code)).toEqual(['BX-001']);
});
