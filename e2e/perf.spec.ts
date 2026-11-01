import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { largeProject } from '../tests/fixtures/large';
import { exportProject } from '../src/domain/exchange';

// Realistic large display (264 modules + 1,584 markers) next to a tiny one (66 modules):
// the difference between them is the editor's cost; the rest is test-harness overhead.
const fixtures = [
  ['large', () => largeProject()],
  ['tiny', () => largeProject({ tablesAcross: 1, itemsPerModule: 0 })],
] as const;

for (const [label, build] of fixtures) {
  test(`${label} display: open, drag and pan stay responsive`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chrome-desktop', 'measured once, on desktop');
    const file = info.outputPath('large.brickwood.json');
    writeFileSync(file, exportProject(build()));
    await page.goto('/');
    await page.getByTestId('import-input').setInputFiles(file);
    const t0 = Date.now();
    await page.getByRole('article', { name: 'Large exhibition fixture' }).getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.locator('footer.statusbar').getByText(/\d+ modules/)).toBeVisible(); // the editor's, not a dashboard card's
    const openMs = Date.now() - t0;

    const frame = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    const at = (x: number, y: number) =>
      page.evaluate(([x, y]) => (window as unknown as { __brickwoodEditor: { toPage(x: number, y: number): { x: number; y: number } } }).__brickwoodEditor.toPage(x, y), [x, y] as const);

    // Zoom in so the drag covers many studs, then drag one module 20 steps.
    const start = await at(8 + 16 * 10, 8 + 16 * 3);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const steps = 20;
    const t1 = Date.now();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(start.x + i * 6, start.y + i * 2);
      await frame();
    }
    const dragMs = (Date.now() - t1) / steps;
    await page.mouse.up();

    const t2 = Date.now();
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -120);
      await frame();
    }
    const zoomMs = (Date.now() - t2) / 10;
    console.log(`${label}: open ${openMs} ms; drag ${dragMs.toFixed(1)} ms/step; zoom ${zoomMs.toFixed(1)} ms/step`);
    info.annotations.push({ type: 'perf', description: `open ${openMs} ms; drag ${dragMs.toFixed(1)} ms/step; zoom ${zoomMs.toFixed(1)} ms/step` });
    // Headless software rendering while other tests run in parallel: generous ceilings that
    // still catch a real regression (timings are logged above for the report).
    expect(dragMs).toBeLessThan(120);
    expect(zoomMs).toBeLessThan(150);
  });
}
