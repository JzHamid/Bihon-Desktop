const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { stateDirectory, runtimeDirectory, platformDetails, samePath, javaInvocation, serverEnvironment, updateInstructions } = require('../desktop/platform.cjs');
const { migrate } = require('../desktop/storage.cjs');
const { downloadVerified } = require('../scripts/runtime-tools.cjs');

async function fixture(t) {
  const base = path.resolve(__dirname, '../.test-data/platform-tests');
  await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('Windows retains its existing library location, with a safe missing-env fallback', () => {
  assert.equal(stateDirectory({ platform: 'win32', home: 'C:\\Users\\Reader', env: { LOCALAPPDATA: 'C:\\Users\\Reader\\AppData\\Local' } }), 'C:\\Users\\Reader\\AppData\\Local\\Bihon');
  assert.equal(stateDirectory({ platform: 'win32', home: 'C:\\Users\\Reader', env: {} }), 'C:\\Users\\Reader\\AppData\\Local\\Bihon');
  assert.equal(stateDirectory({ platform: 'win32', env: { BIHON_DATA_DIR: 'D:\\My library' } }), 'D:\\My library');
});

test('Linux stores persistent data under XDG data home, independent of the working directory', () => {
  assert.equal(stateDirectory({ platform: 'linux', home: '/home/reader', env: {} }), '/home/reader/.local/share/Bihon');
  assert.equal(stateDirectory({ platform: 'linux', home: '/home/reader', env: { XDG_DATA_HOME: '/data/reader' } }), '/data/reader/Bihon');
  assert.equal(stateDirectory({ platform: 'linux', home: '/home/reader', env: { XDG_DATA_HOME: 'relative/path' } }), '/home/reader/.local/share/Bihon');
  assert.equal(stateDirectory({ platform: 'linux', home: '/home/reader', env: { BIHON_DATA_DIR: '/mounted/My library' } }), '/mounted/My library');
});

test('each supported desktop selects its native pinned runtime and rejects unsupported architectures', () => {
  assert.equal(runtimeDirectory('/build', 'linux', 'x64'), '/build/runtime/Suwayomi-Server-v2.3.2243-linux-x64');
  assert.equal(runtimeDirectory('C:\\build', 'win32', 'x64'), 'C:\\build\\runtime\\Suwayomi-Server-v2.3.2243-windows-x64');
  assert.match(platformDetails('linux', 'x64').webview.asset, /linux-x64/);
  assert.match(platformDetails('win32', 'x64').webview.asset, /windows-x64/);
  assert.throws(() => platformDetails('linux', 'arm64'), /Unsupported platform: linux-arm64/);
  assert.throws(() => platformDetails('darwin', 'x64'), /Unsupported platform/);
});

test('JVM invocation uses a native executable and classpath delimiter without shell quoting paths', () => {
  for (const platform of ['linux', 'win32']) {
    const paths = platform === 'win32' ? path.win32 : path.posix;
    const root = platform === 'win32' ? 'C:\\Bihon 漫画' : '/opt/Bihon 漫画';
    const runtime = paths.join(root, 'runtime'), wrapper = paths.join(root, 'java');
    const stateDir = paths.join(root, 'my library');
    const { executable, args } = javaInvocation({ runtime, wrapper, stateDir, tempDir: paths.join(stateDir, 'temp'), enforced: { ip: '127.0.0.1', port: 1234, downloadsPath: paths.join(root, 'Chapter downloads'), authMode: 'NONE' }, platform, arch: 'x64' });
    assert.equal(executable, paths.join(runtime, 'jre', 'bin', platform === 'win32' ? 'java.exe' : 'java'));
    assert.equal(args[args.indexOf('-cp') + 1], `${wrapper}${paths.delimiter}${paths.join(runtime, 'bin', 'Suwayomi-Server.jar')}`);
    assert.ok(args.includes(`-Dsuwayomi.tachidesk.config.server.rootDir=${stateDir}`));
    assert.ok(args.includes('-Dsuwayomi.tachidesk.config.server.ip="127.0.0.1"'));
    assert.ok(args.includes('-Dsuwayomi.tachidesk.config.server.authMode="NONE"'));
    assert.equal(args.at(-1), 'BihonServer');
  }
});

test('Linux folder identity respects case while Windows retains case-insensitive behavior', () => {
  assert.equal(samePath('/data/Comics', '/data/comics', 'linux'), false);
  assert.equal(samePath('/data/comics/../Books', '/data/Books', 'linux'), true);
  assert.equal(samePath('C:\\Comics', 'c:\\comics\\', 'win32'), true);
});

test('Linux preserves the upstream JVM abort guard and existing environment without changing Windows', () => {
  const env = { DISPLAY: ':99', LD_PRELOAD: '/opt/user-library.so' };
  assert.deepEqual(serverEnvironment({ runtime: '/opt/Bihon/runtime', platform: 'linux', env }), { DISPLAY: ':99', LD_PRELOAD: '/opt/Bihon/runtime/bin/catch_abort.so:/opt/user-library.so' });
  assert.deepEqual(serverEnvironment({ runtime: '/my folder/runtime', platform: 'linux', env }), env);
  assert.deepEqual(serverEnvironment({ runtime: 'C:\\Bihon', platform: 'win32', env }), env);
  assert.equal(env.LD_PRELOAD, '/opt/user-library.so');
});

test('Linux can move downloads to an empty case-distinct folder', { skip: process.platform !== 'linux' }, async t => {
  const dir = await fixture(t);
  const source = path.join(dir, 'Comics'), destination = path.join(dir, 'comics');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'chapter.cbz'), 'offline chapter');
  let committed;
  await migrate({ stateDir: path.join(dir, 'state'), source, destination, commit: async value => { committed = value; } });
  assert.equal(committed, destination);
  assert.equal(await fs.readFile(path.join(destination, 'chapter.cbz'), 'utf8'), 'offline chapter');
  assert.deepEqual(await fs.readdir(source), []);
});

test('update help gives instructions for the installed package platform', () => {
  assert.match(updateInstructions('win32'), /Setup installer/);
  assert.match(updateInstructions('linux'), /\.deb package.*AppImage/);
});

test('download preparation verifies cached archives before using them', async t => {
  const dir = await fixture(t), file = path.join(dir, 'server.tar.gz');
  await fs.writeFile(file, 'original');
  const spec = { sha256: crypto.createHash('sha256').update('expected').digest('hex') };
  await assert.rejects(downloadVerified('https://example.invalid/server', file, spec), /Checksum mismatch for cached/);
  assert.equal(await fs.readFile(file, 'utf8'), 'original');
});

test('download preparation verifies streamed WebView bytes and leaves no accepted corrupt archive', async t => {
  const dir = await fixture(t), file = path.join(dir, 'webview.tar.gz');
  const bytes = 'pinned native runtime';
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  const spec = { sha512: crypto.createHash('sha512').update(bytes).digest('hex') };
  await downloadVerified('https://example.invalid/webview', file, spec);
  assert.equal(await fs.readFile(file, 'utf8'), bytes);
  await assert.rejects(downloadVerified('https://example.invalid/corrupt', path.join(dir, 'corrupt'), { sha256: '0'.repeat(64) }), /Checksum mismatch/);
  assert.deepEqual(await fs.readdir(dir), ['webview.tar.gz']);
});
