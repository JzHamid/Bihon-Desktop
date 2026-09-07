const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { migrate, readJson } = require('../desktop/storage.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bihon-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'old 漫画'), destination = path.join(root, 'new folder'), stateDir = path.join(root, 'state');
  await fs.mkdir(path.join(source, 'mangas', 'Series'), { recursive: true });
  await fs.writeFile(path.join(source, 'mangas', 'Series', 'Chapter 1.cbz'), 'offline chapter');
  let committed;
  return { source, destination, stateDir, commit: async p => { committed = p; }, get committed() { return committed; } };
}
test('moves Unicode and spaced paths only after verifying copies', async t => {
  const f = await fixture(t); await migrate(f);
  assert.equal(f.committed, f.destination);
  assert.equal(await fs.readFile(path.join(f.destination, 'mangas/Series/Chapter 1.cbz'), 'utf8'), 'offline chapter');
  assert.deepEqual(await fs.readdir(f.source), []);
});
test('insufficient space preserves source and settings', async t => {
  const f = await fixture(t);
  await assert.rejects(migrate({ ...f, freeSpace: 0 }), /free space/);
  assert.equal(f.committed, undefined);
  assert.equal(await fs.readFile(path.join(f.source, 'mangas/Series/Chapter 1.cbz'), 'utf8'), 'offline chapter');
});
test('rejects nonempty destination without overwriting', async t => {
  const f = await fixture(t); await fs.mkdir(f.destination); await fs.writeFile(path.join(f.destination, 'personal.txt'), 'keep');
  await assert.rejects(migrate(f), /empty folder/);
  assert.equal(await fs.readFile(path.join(f.destination, 'personal.txt'), 'utf8'), 'keep');
});
test('rejects nested destination and destination parent', async t => {
  const f = await fixture(t);
  await assert.rejects(migrate({ ...f, destination: path.join(f.source, 'nested') }), /outside/);
  await assert.rejects(migrate({ ...f, destination: path.dirname(f.source) }), /outside/);
});
test('interrupted copy resumes from saved journal', async t => {
  const f = await fixture(t);
  await assert.rejects(migrate({ ...f, checkpoint: async stage => { if (stage === 'copied') throw new Error('power failure'); } }), /power failure/);
  assert.equal(f.committed, undefined);
  assert.ok(await readJson(path.join(f.stateDir, 'download-migration.json')));
  await migrate({ stateDir: f.stateDir, commit: f.commit });
  assert.equal(f.committed, f.destination);
  assert.deepEqual(await fs.readdir(f.source), []);
});
test('interrupted commit recovers idempotently', async t => {
  const f = await fixture(t);
  await assert.rejects(migrate({ ...f, checkpoint: async stage => { if (stage === 'committed') throw new Error('power failure'); } }), /power failure/);
  await migrate({ stateDir: f.stateDir, commit: f.commit });
  assert.equal(f.committed, f.destination);
  assert.deepEqual(await fs.readdir(f.source), []);
});
test('destination corruption during copy never removes original', async t => {
  const f = await fixture(t);
  await assert.rejects(migrate({ ...f, checkpoint: async stage => { if (stage === 'copied') await fs.writeFile(path.join(f.destination, 'mangas/Series/Chapter 1.cbz'), 'corrupt'); } }), /changed/);
  assert.equal(f.committed, undefined);
  assert.equal(await fs.readFile(path.join(f.source, 'mangas/Series/Chapter 1.cbz'), 'utf8'), 'offline chapter');
});
test('commit failure keeps originals and can be retried', async t => {
  const f = await fixture(t);
  await assert.rejects(migrate({ ...f, commit: async () => { throw new Error('access denied'); } }), /access denied/);
  assert.equal(await fs.readFile(path.join(f.source, 'mangas/Series/Chapter 1.cbz'), 'utf8'), 'offline chapter');
  await migrate(f); assert.equal(f.committed, f.destination);
});
test('denied destination write preserves original and creates no journal', async t => {
  const f = await fixture(t);
  const write = fs.writeFile;
  t.mock.method(fs, 'writeFile', async (file, ...args) => {
    if (String(file).includes('.bihon-write-test-')) throw Object.assign(new Error('access denied'), { code: 'EACCES' });
    return write(file, ...args);
  });
  await assert.rejects(migrate(f), /access denied/);
  assert.equal(f.committed, undefined);
  assert.equal(await readJson(path.join(f.stateDir, 'download-migration.json'), null), null);
});
test('junction destination is rejected', async t => {
  const f = await fixture(t);
  const target = path.join(path.dirname(f.source), 'target'); await fs.mkdir(target);
  await fs.symlink(target, f.destination, 'junction');
  await assert.rejects(migrate(f), /Linked folders/);
});
