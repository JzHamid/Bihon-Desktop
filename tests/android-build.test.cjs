const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, upstream, prepare, androidVersionCode, insideWorkspace } = require('../scripts/android-prepare.cjs');
const { verifyApk, normalizeFingerprint } = require('../scripts/android-collect.cjs');
const version = require('../package.json').version;
fs.mkdirSync(path.join(root, '.test-data'), { recursive: true });

test('Android source preparation rejects an unpinned archive before extraction', async () => {
  const directory = fs.mkdtempSync(path.join(root, '.test-data', 'android-corrupt-'));
  const archive = path.join(directory, 'modified-source.tar.gz');
  fs.writeFileSync(archive, 'not the reviewed upstream archive');
  try {
    await assert.rejects(prepare({ directory: path.join(directory, 'source'), archive }), /SHA-256 mismatch/);
    assert.equal(fs.existsSync(path.join(directory, 'source')), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Android preparation preserves nonempty directories and rejects paths outside the repo', async () => {
  const directory = fs.mkdtempSync(path.join(root, '.test-data', 'android-existing-'));
  const sentinel = path.join(directory, 'important.txt');
  fs.writeFileSync(sentinel, 'preserve me');
  try {
    await assert.rejects(prepare({ directory }), /Refusing to overwrite/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve me');
    assert.throws(() => insideWorkspace(root), /child directory/);
    assert.throws(() => insideWorkspace(path.dirname(root)), /child directory/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Android versions increase monotonically and cannot silently collide', () => {
  assert.ok(androidVersionCode('0.4.0') > androidVersionCode('0.3.99'));
  assert.ok(androidVersionCode('1.0.0') > androidVersionCode('0.99.99'));
  for (const invalid of ['1.0.0-test', '1.100.0', '2100.0.0', '0.0.-1']) {
    assert.throws(() => androidVersionCode(invalid));
  }
});

function apkTools({ appId = upstream.applicationId, appVersion = version, fingerprint = 'a'.repeat(64), debug = false, failSignature = false } = {}) {
  return (_command, args) => {
    if (args[0] === 'manifest') {
      return { 'application-id': appId, 'version-name': appVersion, 'version-code': String(androidVersionCode(version)), 'min-sdk': String(upstream.minimumAndroidApi) }[args[1]];
    }
    if (failSignature) throw new Error('APK signature did not verify');
    return `Signer #1 certificate DN: CN=${debug ? 'Android Debug' : 'Bihon Android'}, O=Bihon\nSigner #1 certificate SHA-256 digest: ${fingerprint}\n`;
  };
}
const tools = { apkanalyzer: 'apkanalyzer', apksigner: 'apksigner' };

test('release collection rejects another app, stale version, corrupt signature, and wrong certificate', () => {
  assert.throws(() => verifyApk('test.apk', 'a'.repeat(64), apkTools({ appId: 'app.mihon' }), tools), /application ID/);
  assert.throws(() => verifyApk('test.apk', 'a'.repeat(64), apkTools({ appVersion: '0.0.0' }), tools), /release version/);
  assert.throws(() => verifyApk('test.apk', 'a'.repeat(64), apkTools({ failSignature: true }), tools), /signature did not verify/);
  assert.throws(() => verifyApk('test.apk', 'b'.repeat(64), apkTools(), tools), /signing certificate/);
  assert.equal(verifyApk('test.apk', 'a'.repeat(64), apkTools(), tools).applicationId, upstream.applicationId);
});

test('test APK collection requires a disposable debug signer', () => {
  assert.throws(() => verifyApk('test.apk', undefined, apkTools(), tools, true), /Android Debug/);
  assert.equal(verifyApk('test.apk', undefined, apkTools({ debug: true }), tools, true).certificateSha256, 'a'.repeat(64));
  assert.equal(normalizeFingerprint('AA:'.repeat(31) + 'AA'), 'a'.repeat(64));
  assert.throws(() => normalizeFingerprint('bad digest'), /SHA-256/);
});
