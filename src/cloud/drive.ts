// The cloud folder the app syncs with. OneDrive (Microsoft Graph) is the real one; tests use
// an in-memory one. Paths are inside the app's own folder (OneDrive → Apps → <app name>), so
// the app never sees the rest of the user's files.

export interface RemoteFile {
  name: string;
  eTag: string;
  modified: string;
}

/** Someone changed the file since we last saw it (or it exists when we expected it not to). */
export class RemoteChangedError extends Error {
  constructor(path: string) {
    super(`${path} was changed on another device`);
    this.name = 'RemoteChangedError';
  }
}

/** Not signed in (or the sign-in ran out): the user needs to sign in again. */
export class SignInNeededError extends Error {
  constructor(message = 'Sign in to OneDrive again') {
    super(message);
    this.name = 'SignInNeededError';
  }
}

export interface CloudDrive {
  /** Files directly in a folder (empty if the folder doesn't exist yet). */
  list(folder: string): Promise<RemoteFile[]>;
  /** A file's contents, or null if it doesn't exist. */
  read(path: string): Promise<{ text: string; eTag: string } | null>;
  /**
   * Write a file. `ifMatch`: the eTag it must still have (an update), or null if it must not
   * exist yet (a new file). Throws RemoteChangedError when that isn't so.
   */
  write(path: string, text: string, ifMatch: string | null): Promise<{ eTag: string }>;
  /** Who is signed in, for display. */
  account(): Promise<string>;
}

/** In-memory drive (tests, and for trying things without an account). */
export class MemoryDrive implements CloudDrive {
  files = new Map<string, { text: string; eTag: string; modified: string }>();
  private n = 0;
  constructor(private who = 'Test account') {}

  async list(folder: string): Promise<RemoteFile[]> {
    const prefix = `${folder}/`;
    return [...this.files]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map(([p, f]) => ({ name: p.slice(prefix.length), eTag: f.eTag, modified: f.modified }));
  }

  async read(path: string) {
    const f = this.files.get(path);
    return f ? { text: f.text, eTag: f.eTag } : null;
  }

  async write(path: string, text: string, ifMatch: string | null) {
    const cur = this.files.get(path);
    if (ifMatch === null ? !!cur : cur?.eTag !== ifMatch) throw new RemoteChangedError(path);
    const eTag = `"e${++this.n}"`;
    this.files.set(path, { text, eTag, modified: new Date().toISOString() });
    return { eTag };
  }

  async account() {
    return this.who;
  }
}
