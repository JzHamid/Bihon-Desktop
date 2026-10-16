const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const invoke = (script, args = [], cwd = root) => spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { cwd, encoding: 'utf8', windowsHide: true });

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bihon-release-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

// Read Git's ZIP output independently of the archive-producing script.
function unzip(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'Source archive is not a ZIP file.');
  const entries = new Map();
  let offset = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const filenameLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + filenameLength).toString('utf8');
    const local = bytes.readUInt32LE(offset + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + size);
    assert.ok(method === 0 || method === 8, `Unexpected ZIP compression: ${method}`);
    entries.set(name, method === 8 ? zlib.inflateRawSync(compressed) : compressed);
    offset += 46 + filenameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return entries;
}

test('release checksums cover current Windows, Linux, Android and source bytes while excluding stale artifacts', async t => {
  const directory = await fixture(t);
  const files = new Map([
    [`Bihon-Setup-${version}-x64.exe`, Buffer.from('Windows installer fixture')],
    [`Bihon-${version}-x64.AppImage`, Buffer.from('Linux AppImage fixture')],
    [`Bihon-${version}-x64.deb`, Buffer.from('Linux Debian fixture')],
    [`Bihon-${version}-source.zip`, Buffer.from('Desktop source fixture')],
    [`Bihon-Android-${version}-test.apk`, Buffer.from('Android test APK fixture')],
    [`Bihon-Android-${version}-source.tar.gz`, Buffer.from('Android source fixture')],
  ]);
  for (const [name, bytes] of files) await fs.writeFile(path.join(directory, name), bytes);
  await fs.writeFile(path.join(directory, 'Bihon-Setup-0.0.1-x64.exe'), 'Stale installer');
  await fs.writeFile(path.join(directory, 'README.md'), 'Release instructions');
  await fs.mkdir(path.join(directory, 'win-unpacked'));
  const result = invoke('release-checksums.cjs', [directory]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const sums = await fs.readFile(path.join(directory, `SHA256SUMS-${version}.txt`), 'utf8');
  assert.deepEqual(sums.trim().split('\n'), [...files].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([name, bytes]) => `${hash(bytes)}  ${name}`));
  for (const [name, bytes] of files) assert.deepEqual(await fs.readFile(path.join(directory, name)), bytes);
});

test('checksumming a directory with only stale artifacts fails instead of producing an empty release manifest', async t => {
  const directory = await fixture(t);
  await fs.writeFile(path.join(directory, 'Bihon-0.0.1-x64.AppImage'), 'Stale AppImage');
  const result = invoke('release-checksums.cjs', [directory]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No .*release artifacts/);
  await assert.rejects(fs.access(path.join(directory, `SHA256SUMS-${version}.txt`)), { code: 'ENOENT' });
});

test('source archive contains the clean committed source and refuses to replace it with dirty or untracked work', async t => {
  const directory = await fixture(t);
  await fs.mkdir(path.join(directory, 'scripts'));
  await fs.copyFile(path.join(root, 'scripts/source-archive.cjs'), path.join(directory, 'scripts/source-archive.cjs'));
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  await fs.writeFile(path.join(directory, '.gitignore'), 'dist/\nprivate-fixture.txt\n');
  const source = 'Committed fixture source with Unicode 漫画.\n';
  await fs.writeFile(path.join(directory, 'fixture.txt'), source);
  await fs.writeFile(path.join(directory, 'private-fixture.txt'), 'Ignored local data must stay out');
  const git = args => {
    const result = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=Bihon Test', '-c', 'user.email=bihon-test@localhost', '-C', directory, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  git(['init', '--quiet']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '--all']);
  git(['commit', '--quiet', '-m', 'Synthetic release fixture']);
  const script = path.join(directory, 'scripts/source-archive.cjs');
  const build = () => spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8', windowsHide: true });
  const clean = build();
  assert.equal(clean.status, 0, clean.stderr || clean.stdout);
  const archive = path.join(directory, 'dist/Bihon-1.2.3-source.zip');
  const original = await fs.readFile(archive);
  const entries = unzip(original);
  assert.equal(entries.get('Bihon-1.2.3/fixture.txt').toString('utf8'), source);
  assert.equal(JSON.parse(entries.get('Bihon-1.2.3/package.json')).version, '1.2.3');
  assert.ok([...entries.keys()].every(name => name.startsWith('Bihon-1.2.3/')));
  assert.ok(![...entries.keys()].some(name => name.includes('private-fixture') || name.includes('/.git/') || name.includes('/dist/')));

  await fs.writeFile(path.join(directory, 'fixture.txt'), 'Uncommitted modification');
  assert.notEqual(build().status, 0, 'Dirty tracked work must block source publication.');
  assert.deepEqual(await fs.readFile(archive), original);
  git(['checkout', '--', 'fixture.txt']);
  await fs.writeFile(path.join(directory, 'untracked.txt'), 'Untracked modification');
  assert.notEqual(build().status, 0, 'Untracked work must block source publication.');
  assert.deepEqual(await fs.readFile(archive), original);
});
