import { expect, test, type Page } from '@playwright/test';

// The real file picker can't be automated, so these tests swap in a stand-in "file in the
// OneDrive folder" (kept in sessionStorage so it survives a reload) and drive the real app.
const FAKE_PICKERS = () => {
  const read = (name: string) => sessionStorage.getItem(`file:${name}`) ?? '';
  const handle = (name: string) => ({
    name,
    getFile: async () => ({ text: async () => read(name) }),
    createWritable: async () => {
      let buf = '';
      return {
        write: async (d: string) => void (buf += d),
        close: async () => sessionStorage.setItem(`file:${name}`, buf),
      };
    },
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  });
  const w = window as unknown as Record<string, unknown>;
  w.showSaveFilePicker = async (o: { suggestedName: string }) => handle(o.suggestedName);
  w.showOpenFilePicker = async () => [handle(sessionStorage.getItem('open-name') ?? 'none')];
};

const PARK = 'Brickwood Adventure Park';
const FILE = 'brickwood-adventure-park.brickwood.json';
type Doc = { project: { name: string; revisionId: string; modules: { label: string; x: number }[] } };
const fileDoc = (page: Page, name = FILE) => page.evaluate((n) => JSON.parse(sessionStorage.getItem(`file:${n}`) || 'null'), name) as Promise<Doc | null>;

async function openPark(page: Page) {
  await page.goto('/');
  await page.getByRole('article', { name: PARK, exact: true }).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByText('92 modules')).toBeVisible();
}

async function nudgeC05(page: Page) {
  const at = await page.evaluate(() => {
    const e = (window as unknown as { __brickwoodEditor: { state(): { project: { modules: { label: string; x: number; y: number }[] } }; toPage(x: number, y: number): { x: number; y: number } } }).__brickwoodEditor;
    const m = e.state().project.modules.find((m) => m.label === 'C-05')!;
    return e.toPage(m.x + 16, m.y + 16);
  });
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('ArrowRight');
}

test.describe('save to a file (desktop Chrome)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'chrome-desktop', 'Chrome/Edge on a computer');
    await page.addInitScript(FAKE_PICKERS);
  });

  test('link a file; every save also goes to it', async ({ page }) => {
    await openPark(page);
    await page.getByRole('button', { name: 'Save to a file…' }).click();
    await expect(page.getByRole('button', { name: `✓ ${FILE}` })).toBeVisible();
    const first = (await fileDoc(page))!;
    expect(first.project.name).toBe(PARK);
    const x = first.project.modules.find((m) => m.label === 'C-05')!.x;
    await nudgeC05(page);
    await expect.poll(async () => (await fileDoc(page))!.project.modules.find((m) => m.label === 'C-05')!.x).toBe(x + 1);
    await expect(page.getByRole('button', { name: `✓ ${FILE}` })).toBeVisible();
  });

  test('a change from another computer is never overwritten silently; "Use the file’s version" loads it', async ({ page }) => {
    await openPark(page);
    await page.getByRole('button', { name: 'Save to a file…' }).click();
    await expect(page.getByRole('button', { name: `✓ ${FILE}` })).toBeVisible();
    // Another computer saved into the same OneDrive file.
    await page.evaluate((n) => {
      const doc = JSON.parse(sessionStorage.getItem(`file:${n}`)!);
      doc.project.name = 'Adventure Park (edited on laptop)';
      doc.project.revisionId = crypto.randomUUID();
      sessionStorage.setItem(`file:${n}`, JSON.stringify(doc));
    }, FILE);
    await nudgeC05(page);
    await expect(page.locator('.save-state')).toHaveText('Saved');
    await expect(page.getByRole('alert')).toContainText('was changed somewhere else', { timeout: 10_000 });
    expect((await fileDoc(page))!.project.name).toBe('Adventure Park (edited on laptop)');
    await page.getByRole('button', { name: 'Use the file’s version' }).click();
    await expect(page.getByRole('heading', { name: 'Adventure Park (edited on laptop)' })).toBeVisible();
  });

  test('"Keep this version" overwrites the file only when chosen', async ({ page }) => {
    await openPark(page);
    await page.getByRole('button', { name: 'Save to a file…' }).click();
    await expect(page.getByRole('button', { name: `✓ ${FILE}` })).toBeVisible();
    await page.evaluate((n) => {
      const doc = JSON.parse(sessionStorage.getItem(`file:${n}`)!);
      doc.project.name = 'Theirs';
      doc.project.revisionId = crypto.randomUUID();
      sessionStorage.setItem(`file:${n}`, JSON.stringify(doc));
    }, FILE);
    await nudgeC05(page);
    await page.getByRole('button', { name: 'Keep this version' }).click();
    await expect(page.getByRole('button', { name: `✓ ${FILE}` })).toBeVisible();
    expect((await fileDoc(page))!.project.name).toBe(PARK);
  });

  test('"Open file…" on another computer opens the project and keeps saving to that file', async ({ page }) => {
    await page.goto('/');
    // A project file that arrived through OneDrive (a copy of the Kingdom with a new name).
    const exported = await page.evaluate(async () => {
      const req = indexedDB.open('brickwood-layout-designer');
      const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
      const rows: { doc: { name: string } }[] = await new Promise((r) => {
        const q = db.transaction('projects').objectStore('projects').getAll();
        q.onsuccess = () => r(q.result);
      });
      db.close();
      const kingdom = rows.find((x) => x.doc.name.startsWith('Brickwood Kingdom'))!.doc as Record<string, unknown>;
      return { format: 'brickwood-layout-project', formatVersion: 1, exportedAt: new Date().toISOString(), project: { ...kingdom, name: 'Kingdom from OneDrive', revisionId: crypto.randomUUID() } };
    });
    await page.evaluate((doc) => {
      sessionStorage.setItem('file:kingdom.brickwood.json', JSON.stringify(doc));
      sessionStorage.setItem('open-name', 'kingdom.brickwood.json');
    }, exported);
    await page.getByRole('button', { name: 'Open file…' }).click();
    await expect(page.getByRole('heading', { name: 'Kingdom from OneDrive' })).toBeVisible();
    await expect(page.getByRole('button', { name: '✓ kingdom.brickwood.json' })).toBeVisible();
    // The copy that was on this computer is kept as a checkpoint.
    await page.getByRole('button', { name: '← Projects' }).click();
    await expect(page.getByRole('article', { name: 'Kingdom from OneDrive' })).toBeVisible();
  });
});

test('browsers without file access (Safari, Firefox) show no file buttons', async ({ page }, info) => {
  test.skip(info.project.name !== 'chrome-desktop', 'desktop');
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
  });
  await openPark(page);
  await expect(page.getByRole('button', { name: 'Save to a file…' })).toHaveCount(0);
  await page.getByRole('button', { name: '← Projects' }).click();
  await expect(page.getByRole('button', { name: 'Open file…' })).toHaveCount(0);
});
