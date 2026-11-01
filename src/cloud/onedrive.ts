// OneDrive through Microsoft Graph, signed in with the user's own Microsoft account.
// Sign-in is the standard "authorization code with PKCE" flow for single-page apps: no server,
// no secret. The app only asks for its own folder (Files.ReadWrite.AppFolder).
import { RemoteChangedError, SignInNeededError, type CloudDrive, type RemoteFile } from './drive';

export const LOGIN_BASE = 'https://login.microsoftonline.com';
export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
export const SCOPES = 'Files.ReadWrite.AppFolder offline_access';

export interface CloudConfig {
  /** Application (client) ID from the app registration. */
  clientId: string;
  /** "consumers" for personal Microsoft accounts (OneDrive with Office 365 Family). */
  authority: string;
}

export interface Tokens {
  access: string;
  refresh?: string;
  /** ms since epoch */
  expiresAt: number;
}

export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(t: Tokens | null): Promise<void>;
}

/** Where Microsoft sends the user back: this app's own address (no query or hash). */
export const redirectUri = () => `${window.location.origin}${window.location.pathname}`;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function challenge(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

const PENDING = 'brickwood.signin';

/** Go to Microsoft's sign-in page; it comes back to this app with a code. */
export async function startSignIn(cfg: CloudConfig, returnTo = window.location.hash): Promise<void> {
  const verifier = randomString();
  const state = randomString(16);
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state, returnTo }));
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: await challenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  window.location.assign(`${LOGIN_BASE}/${cfg.authority}/oauth2/v2.0/authorize?${q}`);
}

async function tokenRequest(cfg: CloudConfig, body: Record<string, string>, fetchImpl: typeof fetch): Promise<Tokens> {
  const res = await fetchImpl(`${LOGIN_BASE}/${cfg.authority}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, scope: SCOPES, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new SignInNeededError(json.error_description?.split('\n')[0] || 'Microsoft sign-in did not work');
  return { access: json.access_token, refresh: json.refresh_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
}

/**
 * If this page load is Microsoft sending the user back, finish signing in. Returns true when
 * it did (the address is cleaned up and the user is returned to where they were).
 */
export async function completeSignIn(cfg: CloudConfig, store: TokenStore, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const q = new URLSearchParams(window.location.search);
  const code = q.get('code');
  const err = q.get('error');
  if (!code && !err) return false;
  const pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as { verifier: string; state: string; returnTo: string } | null;
  sessionStorage.removeItem(PENDING);
  window.history.replaceState(null, '', `${redirectUri()}${pending?.returnTo ?? ''}`);
  if (err) throw new SignInNeededError(q.get('error_description')?.split('\n')[0] || 'Sign-in was cancelled');
  if (!pending || pending.state !== q.get('state')) throw new SignInNeededError('Sign-in could not be checked; please try again');
  await store.set(await tokenRequest(cfg, { grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri(), code_verifier: pending.verifier }, fetchImpl));
  return true;
}

/** A valid access token, refreshing it when it is about to run out. */
export async function accessToken(cfg: CloudConfig, store: TokenStore, fetchImpl: typeof fetch = fetch): Promise<string> {
  const t = await store.get();
  if (!t) throw new SignInNeededError('Not signed in to OneDrive');
  if (t.expiresAt - Date.now() > 120_000) return t.access;
  if (!t.refresh) throw new SignInNeededError();
  try {
    const next = await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: t.refresh }, fetchImpl);
    await store.set({ ...next, refresh: next.refresh ?? t.refresh });
    return next.access;
  } catch (e) {
    if (e instanceof SignInNeededError) await store.set(null);
    throw e;
  }
}

const SIMPLE_LIMIT = 4 * 1024 * 1024;
const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** The app's folder in the user's OneDrive. */
export class OneDrive implements CloudDrive {
  constructor(
    private token: () => Promise<string>,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
    private base = GRAPH_BASE,
  ) {}

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(url.startsWith('http') ? url : `${this.base}${url}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.token()}`, ...(init.headers ?? {}) },
    });
    if (res.status === 401) throw new SignInNeededError();
    return res;
  }

  async list(folder: string): Promise<RemoteFile[]> {
    const out: RemoteFile[] = [];
    let url: string | undefined = `/me/drive/special/approot:/${enc(folder)}:/children?$select=name,eTag,lastModifiedDateTime,file&$top=999`;
    while (url) {
      const res: Response = await this.call(url);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`OneDrive: ${res.status} listing ${folder}`);
      const json = (await res.json()) as { value: { name: string; eTag: string; lastModifiedDateTime: string; file?: unknown }[]; '@odata.nextLink'?: string };
      for (const v of json.value) if (v.file) out.push({ name: v.name, eTag: v.eTag, modified: v.lastModifiedDateTime });
      url = json['@odata.nextLink'];
    }
    return out;
  }

  async read(path: string) {
    const res = await this.call(`/me/drive/special/approot:/${enc(path)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OneDrive: ${res.status} reading ${path}`);
    const meta = (await res.json()) as { eTag: string; '@microsoft.graph.downloadUrl'?: string };
    // The download address is pre-authorised (no token needed).
    const file = meta['@microsoft.graph.downloadUrl'] ? await this.fetchImpl(meta['@microsoft.graph.downloadUrl']) : await this.call(`/me/drive/special/approot:/${enc(path)}:/content`);
    if (!file.ok) throw new Error(`OneDrive: ${file.status} downloading ${path}`);
    return { text: await file.text(), eTag: meta.eTag };
  }

  async write(path: string, text: string, ifMatch: string | null) {
    const body = new Blob([text], { type: 'application/json' });
    const cond: Record<string, string> = ifMatch ? { 'If-Match': ifMatch } : {};
    let res: Response;
    if (body.size <= SIMPLE_LIMIT) {
      const q = ifMatch === null ? '?@microsoft.graph.conflictBehavior=fail' : '';
      res = await this.call(`/me/drive/special/approot:/${enc(path)}:/content${q}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...cond }, body });
    } else {
      // Big files go up in pieces.
      const s = await this.call(`/me/drive/special/approot:/${enc(path)}:/createUploadSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cond },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': ifMatch === null ? 'fail' : 'replace' } }),
      });
      if (s.status === 412 || s.status === 409) throw new RemoteChangedError(path);
      if (!s.ok) throw new Error(`OneDrive: ${s.status} starting upload of ${path}`);
      const { uploadUrl } = (await s.json()) as { uploadUrl: string };
      const CHUNK = 320 * 1024 * 20;
      res = new Response(null, { status: 500 });
      for (let at = 0; at < body.size; at += CHUNK) {
        const end = Math.min(body.size, at + CHUNK);
        res = await this.fetchImpl(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${at}-${end - 1}/${body.size}` }, body: body.slice(at, end) });
        if (!res.ok && res.status !== 202) break;
      }
    }
    if (res.status === 412 || res.status === 409) throw new RemoteChangedError(path);
    if (!res.ok) throw new Error(`OneDrive: ${res.status} saving ${path}`);
    const item = (await res.json()) as { eTag: string };
    return { eTag: item.eTag };
  }

  async account() {
    const res = await this.call('/me/drive?$select=owner');
    if (!res.ok) return 'OneDrive';
    const json = (await res.json()) as { owner?: { user?: { displayName?: string } } };
    return json.owner?.user?.displayName || 'OneDrive';
  }
}
