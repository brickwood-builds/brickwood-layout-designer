import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Phase 6: setup plan — tasks from the layout, required order with override, helpers, timing,
// log, and a helper's progress file.
type Hook = { state(): { project: { shows: { setup: { log: { kind: string; who: string }[]; times: Record<string, string> } }[] } } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state());

test('setup plan: tasks, out-of-order with a reason, helpers, timing, progress file', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.goto('/');
  await page.getByRole('article', { name: 'Brickwood Adventure Park', exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __brickwoodEditor?: unknown }).__brickwoodEditor);

  // A lamp marker in the middle of the view (on a module).
  await page.getByText('Setup markers', { exact: true }).click();
  await page.getByRole('button', { name: '+ New marker…' }).click();
  await page.getByPlaceholder('e.g. Popcorn cart').fill('Lamp');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();

  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByLabel(/^Setup & helpers/).check();
  await expect(page.getByLabel(/^Shows/)).toBeChecked();
  await page.getByRole('button', { name: 'More tools' }).click();

  await page.getByRole('button', { name: 'Setup…' }).click(); // no show yet: opens Shows
  const shows = page.getByRole('dialog', { name: 'Shows' });
  await shows.getByLabel('Show name').fill('BrickFair');
  await shows.getByRole('button', { name: 'Add show' }).click();
  await page.getByRole('dialog', { name: 'BrickFair' }).getByRole('button', { name: 'Setup plan…' }).click();

  const w = page.getByRole('dialog', { name: 'Setup — BrickFair' });
  await w.getByLabel('I am').fill('Jen');
  await w.getByLabel('I am').blur();
  await expect(w.locator('.task').first()).toContainText('Place Roller Coaster'); // leftmost first
  await w.getByRole('button', { name: 'Start setup' }).click();
  await expect(w.getByText(/^Started/)).toBeVisible();

  // The lamp's task needs its module first: doing it now asks why.
  const loose = w.locator('.task', { hasText: /Put out the things on .* Lamp/ });
  await expect(loose).toHaveCount(1);
  await loose.getByRole('checkbox').click(); // asks why instead of ticking
  await w.getByLabel('Reason').fill('Plate was already down');
  await w.getByRole('button', { name: 'Mark done anyway' }).click();
  await expect(loose).toContainText(/Done by Jen .* \(out of order\)/);

  // The first plate: I'll do it, then done.
  const first = w.locator('.task').first();
  await first.getByRole('button', { name: 'I’ll do it' }).click();
  await expect(first).toContainText('Jen is on it');
  await first.getByRole('checkbox').check();
  await expect(first).toContainText('Done by Jen');

  // Own task after the first plate.
  await w.getByLabel('New task').fill('Plug in ride power');
  await w.getByRole('button', { name: 'Add task' }).click();
  await expect(w.locator('.task', { hasText: 'Plug in ride power' })).toBeVisible();

  // Helpers, the log, and a progress file (re-adding it changes nothing).
  await w.getByRole('tab', { name: 'Helpers & log' }).click();
  await w.getByLabel('Helper name').fill('Bob');
  await w.getByRole('button', { name: 'Add helper' }).click();
  await w.getByLabel('Issue').fill('Ferris wheel motor stalled — swapped battery box');
  await w.getByRole('button', { name: 'Add to log' }).click();
  await expect(w.locator('.history li').first()).toContainText('Ferris wheel motor stalled');
  const [dl] = await Promise.all([page.waitForEvent('download'), w.getByRole('button', { name: 'Send my progress' }).click()]);
  const file = await readFile((await dl.path())!, 'utf8');
  expect(JSON.parse(file)).toMatchObject({ kind: 'brickwood-setup-progress', from: 'Jen' });
  await w.getByLabel('Helper progress file').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await expect(w.getByText('Added Jen’s progress: 0 task(s) updated.')).toBeVisible();

  const log = (await st(page)).project.shows[0]!.setup.log;
  expect(log.map((l) => l.kind)).toEqual(expect.arrayContaining(['timing', 'task', 'override', 'issue', 'sync']));
  expect(log.every((l) => l.who === 'Jen')).toBe(true);
});
