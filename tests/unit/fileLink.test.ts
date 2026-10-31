import { afterEach, describe, expect, it } from 'vitest';
import { FileChangedError, FileLinks, dbLinkStore, type FileHandleLike, type FileLink, type LinkStore } from '../../src/storage/fileLink';
import { exportProject, parseProjectFile } from '../../src/domain/exchange';
import { createProject } from '../../src/domain/project';
import { newId } from '../../src/domain/ids';
import { openDb, type BrickwoodDb } from '../../src/storage/db';
import { ProjectRepository } from '../../src/storage/repository';

/** In-memory stand-in for a file in the OneDrive folder. */
interface FakeFile {
  text: string;
  writes: number;
  permission: PermissionState;
  handle: FileHandleLike;
}

function fakeFile(name = 'park.brickwood.json', text = ''): FakeFile {
  const file: FakeFile = {
    text,
    writes: 0,
    permission: 'granted',
    handle: {
      name,
      getFile: async () => ({ text: async () => file.text }),
      createWritable: async () => {
        let buf = '';
        return {
          write: async (d: string) => void (buf += d),
          close: async () => {
            file.text = buf;
            file.writes++;
          },
        };
      },
      queryPermission: async () => file.permission,
      requestPermission: async () => (file.permission = 'granted'),
    },
  };
  return file;
}

function memoryStore(): LinkStore {
  const m = new Map<string, FileLink>();
  return { get: async (id) => m.get(id), put: async (l) => void m.set(l.projectId, l), delete: async (id) => void m.delete(id) };
}

let db: BrickwoodDb | undefined;
afterEach(async () => {
  db?.close();
  await db?.delete();
  db = undefined;
});

describe('save to a file', () => {
  it('linking writes the project in the normal export format; later saves update it', async () => {
    const links = new FileLinks(memoryStore());
    const f = fakeFile();
    const p = createProject({ name: 'Park' });
    const link = await links.link(p, f.handle);
    expect(parseProjectFile(f.text)).toEqual(p);
    expect(await links.check(link)).toMatchObject({ state: 'in-sync' });
    const next = { ...p, name: 'Park v2', revision: 1, revisionId: newId() };
    const link2 = await links.write(link, next);
    expect(parseProjectFile(f.text).name).toBe('Park v2');
    expect(link2.lastRevisionId).toBe(next.revisionId);
    expect((await links.get(p.id))!.lastRevisionId).toBe(next.revisionId);
  });

  it('never overwrites a file changed on another computer unless the user says so', async () => {
    const links = new FileLinks(memoryStore());
    const f = fakeFile();
    const p = createProject({ name: 'Mine' });
    const link = await links.link(p, f.handle);
    // Another computer saved a newer version into the same OneDrive file.
    const theirs = { ...p, name: 'Theirs', revision: 5, revisionId: newId() };
    f.text = exportProject(theirs);
    const writesBefore = f.writes;
    const mine = { ...p, name: 'Mine v2', revision: 1, revisionId: newId() };
    const err = await links.write(link, mine).catch((e) => e);
    expect(err).toBeInstanceOf(FileChangedError);
    expect((err as FileChangedError).fileProject.name).toBe('Theirs');
    expect(f.writes).toBe(writesBefore);
    expect(parseProjectFile(f.text).name).toBe('Theirs');
    // "Keep this version"
    await links.write(link, mine, true);
    expect(parseProjectFile(f.text).name).toBe('Mine v2');
  });

  it('an empty file (new) is not treated as a change', async () => {
    const links = new FileLinks(memoryStore());
    const f = fakeFile();
    const p = createProject({ name: 'New' });
    const link = await links.adopt(p, f.handle);
    expect((await links.check(link)).state).toBe('empty');
    await links.write(link, p);
    expect(parseProjectFile(f.text).id).toBe(p.id);
  });

  it('permission: reports when the browser needs a click, and asks only when allowed to', async () => {
    const links = new FileLinks(memoryStore());
    const f = fakeFile();
    const link = await links.link(createProject({ name: 'x' }), f.handle);
    f.permission = 'prompt';
    expect(await links.permission(link)).toBe('prompt');
    expect(await links.permission(link, true)).toBe('granted');
  });

  it('unlink forgets the file', async () => {
    const links = new FileLinks(memoryStore());
    const p = createProject({ name: 'x' });
    await links.link(p, fakeFile().handle);
    await links.unlink(p.id);
    expect(await links.get(p.id)).toBeUndefined();
  });

  it('the database store keeps links that can be stored, and falls back to memory for ones that cannot', async () => {
    db = openDb(`fl-${newId()}`);
    const store = dbLinkStore(db);
    const p = createProject({ name: 'x' });
    const f = fakeFile();
    await new FileLinks(store).link(p, f.handle); // fake handle has functions: not storable
    expect((await store.get(p.id))!.fileName).toBe('park.brickwood.json');
    const plain = { projectId: newId(), handle: { name: 'h' }, fileName: 'h', lastRevisionId: 'r' } as unknown as FileLink;
    await store.put(plain);
    expect(await db.fileLinks.get(plain.projectId)).toMatchObject({ fileName: 'h' });
  });
});

describe('loading the version from the file', () => {
  it('replaces the local copy, keeps the file revision, and checkpoints what was there', async () => {
    db = openDb(`fl-${newId()}`);
    const repo = new ProjectRepository(db);
    const local = await repo.createProject(createProject({ name: 'Local' }));
    const fromFile = { ...local, name: 'From OneDrive', revision: 9, revisionId: newId() };
    const loaded = await repo.replaceWithVersion(fromFile, 'Before loading the version from its file', { keepRevisionId: true });
    expect(loaded).toMatchObject({ id: local.id, name: 'From OneDrive', revisionId: fromFile.revisionId, revision: 10 });
    const [cp] = await repo.listCheckpoints(local.id);
    expect(cp!.reason).toBe('Before loading the version from its file');
    expect((await repo.previewCheckpoint(cp!.id)).name).toBe('Local');
    // Normal saves continue from the loaded revision.
    const saved = await repo.saveProject({ ...loaded, name: 'Edited' });
    expect(saved.revision).toBe(11);
  });
});
