import type { Locator, Page } from '@playwright/test';

type Hook = { toPage(x: number, y: number): { x: number; y: number } };

/**
 * Put one thing down from the palette the way a person does: pick the entry (it stays held),
 * click on the table, then let go (Escape). `at` is where, in studs; default the middle of
 * the canvas.
 */
export async function putDown(page: Page, entry: Locator, at?: { x: number; y: number }) {
  await entry.click();
  let p: { x: number; y: number };
  if (at) {
    p = await page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: Hook }).__brickwoodEditor.toPage(x, y), [at.x, at.y] as const);
  } else {
    const r = (await page.getByTestId('canvas').boundingBox())!;
    p = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Escape');
}

/** A free spot on the table: right of everything on the active level, halfway down. */
export async function freeSpot(page: Page, width = 16, depth = 16): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([w, d]) => {
      type S = { levelId: string; project: { tables: Pick<R, 'levelId' | 'x' | 'y' | 'width' | 'depth'>[]; modules: R[]; objects: R[] } };
      type R = { levelId: string; x: number; y: number; width: number; depth: number; rotation: number };
      const s = (window as unknown as { __brickwoodEditor: { state(): S } }).__brickwoodEditor.state();
      const on = (r: R) => r.levelId === s.levelId;
      const right = (r: R) => r.x + (r.rotation % 180 ? r.depth : r.width);
      const t = s.project.tables.find((x) => x.levelId === s.levelId)!;
      const used = [...s.project.modules, ...s.project.objects].filter(on);
      const x = Math.max(t.x, ...used.map(right)) + 2 + w / 2;
      return { x: Math.min(x, t.x + t.width - w / 2), y: t.y + Math.max(d / 2, t.depth / 2) };
    },
    [width, depth] as const,
  );
}
