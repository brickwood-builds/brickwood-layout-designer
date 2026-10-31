import { expect, test, type Page } from '@playwright/test';

// Phase 2: pattern stamping (one every N studs) and stairs.
type Obj = { id: string; name: string; x: number; y: number; width: number; depth: number; heightPlates?: number };
type St = {
  project: { objects: Obj[]; modules: { label: string; x: number; y: number }[]; groups: { id: string; name: string; memberIds: string[] }[]; stairs: { points: { x: number; y: number }[]; risePlates: number }[] };
};
type Hook = { state(): St; toPage(x: number, y: number): { x: number; y: number } };
const st = (page: Page) => page.evaluate(() => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.state()) as Promise<St>;
const at = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [x, y] as const);

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

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop');

  test('stamp a round brick every 4 studs along a line; going over it again adds nothing', async ({ page }) => {
    const c05 = await openPark(page);
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByLabel('Draw with').selectOption({ label: 'Brick Round 2×2' });
    await page.getByRole('button', { name: 'Straight' }).click();
    await page.getByRole('group', { name: 'Spacing (studs apart)' }).getByRole('button', { name: '4', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Turn' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Brush width (studs)' })).toHaveCount(0);
    const stroke = async () => {
      const a = await at(page, c05.x + 4, c05.y + 16);
      const b = await at(page, c05.x + 28.4, c05.y + 16); // a touch past the last spot
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.mouse.up();
    };
    await stroke();
    const trees = (await st(page)).project.objects.filter((o) => o.name === 'Brick Round 2×2');
    expect(trees.map((o) => o.x - c05.x).sort((a, b) => a - b)).toEqual([3, 7, 11, 15, 19, 23, 27]);
    await stroke();
    expect((await st(page)).project.objects.filter((o) => o.name === 'Brick Round 2×2')).toHaveLength(7);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect((await st(page)).project.objects.filter((o) => o.name === 'Brick Round 2×2')).toHaveLength(0);
  });

  test('stairs with a turn, then steeper from the panel and a moved end handle', async ({ page }) => {
    const c05 = await openPark(page);
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await page.getByRole('button', { name: 'Stairs' }).click();
    await expect(page.getByRole('group', { name: 'Stairs width (studs)' })).toBeVisible();
    for (const [x, y] of [[4, 26], [20, 26], [20, 6]] as const) {
      const q = await at(page, c05.x + x, c05.y + y);
      await page.mouse.click(q.x, q.y);
    }
    await page.getByRole('button', { name: 'Finish stairs' }).click();
    let s = await st(page);
    const group = s.project.groups.find((g) => g.name.startsWith('Stairs, '))!;
    const steps = s.project.objects.filter((o) => group.memberIds.includes(o.id));
    expect(steps.filter((o) => o.name === 'Stair landing')).toHaveLength(1); // at the turn
    expect(steps.map((o) => o.heightPlates)).toEqual(steps.map((_, i) => i + 1));

    // Select it: the Stairs box offers its settings.
    await page.keyboard.press('v');
    const first = steps[0]!;
    const fp = await at(page, first.x + first.width / 2, first.y + first.depth / 2);
    await page.mouse.click(fp.x, fp.y);
    const rise = page.getByLabel('Rise per step (plates)');
    await rise.fill('3');
    await rise.press('Enter');
    s = await st(page);
    expect(s.project.stairs[0]!.risePlates).toBe(3);
    const steeper = s.project.objects.filter((o) => o.name.startsWith('Stair'));
    expect(steeper).toHaveLength(steps.length);
    expect(Math.max(...steeper.map((o) => o.heightPlates!))).toBe(3 * steps.length);

    // Drag the top end handle further up: more steps.
    await page.getByRole('button', { name: 'Edit path' }).click();
    const end = await at(page, c05.x + 20, c05.y + 6);
    const higher = await at(page, c05.x + 20, c05.y + 2);
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.mouse.move(higher.x, higher.y, { steps: 4 });
    await page.mouse.up();
    s = await st(page);
    expect(s.project.stairs[0]!.points.at(-1)).toEqual({ x: c05.x + 20, y: c05.y + 2 });
    expect(s.project.objects.filter((o) => o.name.startsWith('Stair')).length).toBe(steps.length + 2);
    expect(s.project.groups.filter((g) => g.name.startsWith('Stairs, '))).toHaveLength(1);
    await page.keyboard.press('Control+z');
    expect((await st(page)).project.objects.filter((o) => o.name.startsWith('Stair'))).toHaveLength(steps.length);
  });
});
