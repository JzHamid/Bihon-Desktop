const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { configureDefaultRepository, DEFAULT_REPOSITORY } = require('../desktop/defaults.cjs');
const { prepareUpgrade, markVersionStarted } = require('../desktop/upgrades.cjs');
const { writeJson, readJson } = require('../desktop/storage.cjs');
async function fixture() {
  const base = path.resolve(__dirname, '../.test-data/update-tests');
  await fs.mkdir(base, { recursive: true });
  const stateDir = await fs.mkdtemp(path.join(base, 'case-'));
  return stateDir;
}
function api(stores = [], fail = false) {
  const calls = [];
  return { calls, fetchImpl: async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request);
    if (fail) throw new Error('offline');
    return { ok: true, json: async () => request.query.startsWith('mutation') ? { data: { addExtensionStore: { extensionStore: { name: 'Keiyoushi' } } } } : { data: { extensionStores: { nodes: stores } } } };
  } };
}
test('first launch registers the default; later removal is respected', async () => {
  const stateDir = await fixture(), mock = api();
  assert.equal(await configureDefaultRepository({ stateDir, url: 'http://127.0.0.1:1234', ...mock }), true);
  assert.equal(mock.calls[1].variables.url, DEFAULT_REPOSITORY);
  await configureDefaultRepository({ stateDir, url: 'unused', fetchImpl: async () => { throw Error('must not re-add after removal'); } });
});
test('existing canonical repository is adopted without duplicate or other changes', async () => {
  const stateDir = await fixture(), mock = api([{ indexUrl: 'https://github.com/keiyoushi/extensions/raw/repo/index.pb' }, { indexUrl: 'https://example.test/custom' }]);
  assert.equal(await configureDefaultRepository({ stateDir, url: 'http://127.0.0.1:1234', ...mock }), false);
  assert.equal(mock.calls.length, 1);
});
test('offline and GraphQL errors do not mark setup complete; retry succeeds', async () => {
  const stateDir = await fixture();
  await assert.rejects(configureDefaultRepository({ stateDir, url: 'http://127.0.0.1:1234', ...api([], true) }), /offline/);
  assert.equal(await readJson(path.join(stateDir, 'default-repository.json'), null), null);
  await assert.rejects(configureDefaultRepository({ stateDir, url: 'http://127.0.0.1:1234', fetchImpl: async () => ({ ok: true, json: async () => ({ errors: [{ message: 'failure' }] }) }) }), /failure/);
  assert.equal(await configureDefaultRepository({ stateDir, url: 'http://127.0.0.1:1234', ...api() }), true);
});
async function library() {
  const stateDir = await fixture();
  await fs.mkdir(path.join(stateDir, 'settings'), { recursive: true });
  await fs.mkdir(path.join(stateDir, 'extensions'), { recursive: true });
  await fs.mkdir(path.join(stateDir, 'downloads'), { recursive: true });
  await fs.writeFile(path.join(stateDir, 'database.mv.db'), 'library, category, chapter progress');
  await fs.writeFile(path.join(stateDir, 'settings/source.xml'), 'source preferences');
  await fs.writeFile(path.join(stateDir, 'extensions/test.jar'), 'installed extension');
  await fs.writeFile(path.join(stateDir, 'downloads/chapter.png'), 'chapter files stay in place');
  await writeJson(path.join(stateDir, 'desktop-settings.json'), { downloadsPath: 'E:\\My Comics', port: 1234 });
  return stateDir;
}
test('legacy upgrade backs up database, preferences and extensions, excluding chapters', async () => {
  const stateDir = await library();
  const backup = await prepareUpgrade({ stateDir, version: '0.2.0' });
  assert.equal(await fs.readFile(path.join(backup, 'database.mv.db'), 'utf8'), 'library, category, chapter progress');
  assert.equal(await fs.readFile(path.join(backup, 'extensions/test.jar'), 'utf8'), 'installed extension');
  assert.equal((await readJson(path.join(backup, 'desktop-settings.json'))).downloadsPath, 'E:\\My Comics');
  const manifest = await readJson(path.join(backup, 'manifest.json'));
  assert.equal(manifest.from, '0.1.0');
  assert.ok(manifest.files.every(file => !file.name.startsWith('downloads')));
  assert.equal(await prepareUpgrade({ stateDir, version: '0.2.0' }), backup, 'interrupted startup reuses verified snapshot');
  await markVersionStarted(stateDir, '0.2.0', backup);
  assert.equal(await prepareUpgrade({ stateDir, version: '0.2.0' }), null, 'normal restarts do not accumulate backups');
});
test('interrupted snapshot retries without changing the old library', async () => {
  const stateDir = await library();
  let count = 0;
  await assert.rejects(prepareUpgrade({ stateDir, version: '0.2.0', copyFile: async (source, destination) => {
    if (++count === 2) throw Error('interrupted copy');
    await fs.copyFile(source, destination);
  } }), /interrupted copy/);
  assert.equal(await fs.readFile(path.join(stateDir, 'database.mv.db'), 'utf8'), 'library, category, chapter progress');
  const backup = await prepareUpgrade({ stateDir, version: '0.2.0' });
  assert.ok((await readJson(path.join(backup, 'manifest.json'))).files.length >= 4);
});
test('low space and corruption block startup before changing data', async () => {
  const stateDir = await library();
  await assert.rejects(prepareUpgrade({ stateDir, version: '0.2.0', availableBytes: 0 }), /Not enough space/);
  const backup = await prepareUpgrade({ stateDir, version: '0.2.0' });
  await fs.writeFile(path.join(backup, 'database.mv.db'), 'corrupted backup');
  await assert.rejects(prepareUpgrade({ stateDir, version: '0.2.0' }), /verification failed/);
  assert.equal(await fs.readFile(path.join(stateDir, 'database.mv.db'), 'utf8'), 'library, category, chapter progress');
});
test('new installations need no snapshot; a newer recorded data version rejects downgrade', async () => {
  const stateDir = await fixture();
  assert.equal(await prepareUpgrade({ stateDir, version: '0.2.0' }), null);
  await markVersionStarted(stateDir, '0.10.0', null);
  await assert.rejects(prepareUpgrade({ stateDir, version: '0.2.0' }), /0.10.0/);
});
