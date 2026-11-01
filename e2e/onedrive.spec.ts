import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// OneDrive sync between a computer and an iPad, against a stand-in for Microsoft's sign-in
// and OneDrive (same requests and answers as the real services, kept in memory here).
// The owner's app registration, built into the app (.env.production).
const CLIENT_ID = '3b1a85a4-0881-4ddb-ba16-cfc7c2d29170';
const PARK = 'Brickwood Adventure Park';

function fakeMicrosoft() {
  const files = new Map<string, { text: string; eTag: string }>();
  let n = 0;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,if-match', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS' };
  const json = (body: unknown, status = 200) => ({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  async function install(ctx: BrowserContext) {
    await ctx.route('https://login.microsoftonline.com/**', async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (url.pathname.endsWith('/authorize')) {
        expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
        expect(url.searchParams.get('scope')).toContain('Files.ReadWrite.AppFolder');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        const back = `${url.searchParams.get('redirect_uri')}?code=fake-code&state=${url.searchParams.get('state')}`;
        return route.fulfill({ status: 302, headers: { Location: back } });
      }
      if (url.pathname.endsWith('/token')) {
        const body = new URLSearchParams(route.request().postData() ?? '');
        expect(body.get('code_verifier') ?? body.get('refresh_token')).toBeTruthy();
        return route.fulfill(json({ access_token: 'token', refresh_token: 'refresh', expires_in: 3600 }));
      }
      return route.fulfill({ status: 404, headers: cors });
    });
    await ctx.route('https://graph.microsoft.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if ((await req.headerValue('authorization')) !== 'Bearer token') return route.fulfill(json({}, 401));
      const url = new URL(req.url());
      const path = decodeURIComponent(url.pathname.replace('/v1.0', ''));
      if (path === '/me/drive') return route.fulfill(json({ owner: { user: { displayName: 'Jen' } } }));
      const m = /^\/me\/drive\/special\/approot:\/(.+?)(:\/children|:\/content)?$/.exec(path);
      if (!m) return route.fulfill(json({}, 404));
      const [, p, kind] = m;
      if (kind === ':/children') {
        const items = [...files].filter(([k]) => k.startsWith(`${p}/`) && !k.slice(p!.length + 1).includes('/')).map(([k, f]) => ({ name: k.slice(p!.length + 1), eTag: f.eTag, lastModifiedDateTime: new Date().toISOString(), file: {} }));
        return route.fulfill(items.length ? json({ value: items }) : json({}, 404));
      }
      if (kind === ':/content' && req.method() === 'PUT') {
        const cur = files.get(p!);
        const ifMatch = await req.headerValue('if-match');
        if (url.searchParams.get('@microsoft.graph.conflictBehavior') === 'fail' && cur) return route.fulfill(json({}, 409));
        if (ifMatch && cur?.eTag !== ifMatch) return route.fulfill(json({}, 412));
        const eTag = `"e${++n}"`;
        files.set(p!, { text: req.postData() ?? '', eTag });
        return route.fulfill(json({ eTag }));
      }
      const f = files.get(p!);
      if (!f) return route.fulfill(json({}, 404));
      return route.fulfill(json({ eTag: f.eTag, '@microsoft.graph.downloadUrl': `https://download.example/${encodeURIComponent(p!)}` }));
    });
    await ctx.route('https://download.example/**', (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      const f = files.get(p);
      return route.fulfill(f ? { status: 200, headers: cors, body: f.text } : { status: 404, headers: cors });
    });
  }
  return { files, install };
}

async function connect(page: Page) {
  await page.goto('/');
  // Built in: no setup step on any device, just sign in.
  await expect(page.getByRole('button', { name: 'Set up OneDrive sync…' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in to OneDrive' }).click();
  await expect(page.getByText(/OneDrive \(Jen\): Synced/)).toBeVisible();
}

async function rename(page: Page, from: string, to: string) {
  await page.getByRole('article', { name: from, exact: true }).getByText('More').click();
  await page.getByRole('article', { name: from, exact: true }).getByRole('button', { name: 'Rename…' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill(to);
  await page.getByRole('dialog').getByRole('button', { name: /Rename|Save/ }).click();
  await expect(page.getByRole('article', { name: to, exact: true })).toBeVisible();
}

test('computer and iPad stay in step through OneDrive; a change on both asks which to keep', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'desktop');
  const ms = fakeMicrosoft();
  const pcCtx = await browser.newContext();
  const ipadCtx = await browser.newContext();
  await ms.install(pcCtx);
  await ms.install(ipadCtx);
  const pc = await pcCtx.newPage();
  const ipad = await ipadCtx.newPage();

  // The computer signs in; its projects go up to OneDrive.
  await connect(pc);
  await expect.poll(() => [...ms.files.keys()].filter((k) => k.startsWith('projects/')).length).toBe(3);
  await rename(pc, PARK, 'Park 2026');
  await pc.getByRole('button', { name: 'Sync now' }).click();
  await expect(pc.getByText(/Synced just now/)).toBeVisible();

  // The iPad signs in and gets the renamed park — its untouched starter copy is simply replaced.
  await connect(ipad);
  await expect(ipad.getByRole('article', { name: 'Park 2026', exact: true })).toBeVisible();
  await expect(ipad.getByText(/changed on this device and on another one/)).toHaveCount(0);

  // Both change it before syncing: the computer is asked which to keep.
  await rename(ipad, 'Park 2026', 'Park — iPad');
  await ipad.getByRole('button', { name: 'Sync now' }).click();
  await expect(ipad.getByText(/Synced just now/)).toBeVisible();
  await rename(pc, 'Park 2026', 'Park — computer');
  await pc.getByRole('button', { name: 'Sync now' }).click();
  const banner = pc.getByRole('alert').filter({ hasText: 'was changed on this device and on another one' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Take the other device’s' }).click();
  await expect(pc.getByRole('article', { name: 'Park — iPad', exact: true })).toBeVisible();
  await expect(banner).toHaveCount(0);

  await pcCtx.close();
  await ipadCtx.close();
});
