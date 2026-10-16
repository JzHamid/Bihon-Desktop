const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, upstream, prepare, androidVersionCode, insideWorkspace } = require('../scripts/android-prepare.cjs');
const { verifyApk, normalizeFingerprint, signerCertificates } = require('../scripts/android-collect.cjs');
const { findAndroidTool, sdkInvocation, runAndroidTool } = require('../scripts/android-sdk.cjs');
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

test('APK collection accepts AOSP v3.1 SDK-range certificate reports without weakening identity checks', () => {
  // Format from AOSP ApkSignerTool.verify when isVerifiedUsingV31Scheme is true.
  const report = `Verifies
Verified using v3 scheme (APK Signature Scheme v3): true
Verified using v3.1 scheme (APK Signature Scheme v3.1): true
Number of signers: 1
Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate DN: C=US, O=Android, CN=Android Debug
Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ${'a'.repeat(64)}
Signer (minSdkVersion=28, maxSdkVersion=32) certificate DN: C=US, O=Android, CN=Android Debug
Signer (minSdkVersion=28, maxSdkVersion=32) certificate SHA-256 digest: ${'a'.repeat(64)}
Source Stamp Signer certificate SHA-256 digest: ${'b'.repeat(64)}
`;
  const execute = (command, args) => args[0] === 'verify' ? report : apkTools()(command, args);
  assert.equal(verifyApk('app.apk', undefined, execute, tools, true).certificateSha256, 'a'.repeat(64));
  assert.throws(() => signerCertificates(report.replace('Number of signers: 1', 'Number of signers: 2')), /exactly one/);
  assert.throws(() => signerCertificates(report.replace(`${'a'.repeat(64)}\nSource Stamp`, `${'c'.repeat(64)}\nSource Stamp`)), /exactly one/);
  assert.throws(() => signerCertificates(`Source Stamp Signer certificate SHA-256 digest: ${'a'.repeat(64)}\n`), /exactly one/);
});

test('Android SDK discovery selects platform entrypoints and newest installed build tools', () => {
  const directory = fs.mkdtempSync(path.join(root, '.test-data', 'android sdk spaces '));
  const tool = relative => {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'fake SDK tool');
    return target;
  };
  try {
    const analyzer = tool('cmdline-tools/latest/bin/apkanalyzer.bat');
    const signer = tool('build-tools/37.0.0/apksigner.bat');
    tool('build-tools/9.0.0/apksigner.bat');
    const adb = tool('platform-tools/adb.exe');
    assert.equal(findAndroidTool('apkanalyzer', { sdk: directory, platform: 'win32' }), analyzer);
    assert.equal(findAndroidTool('apksigner', { sdk: directory, platform: 'win32' }), signer);
    assert.equal(findAndroidTool('adb', { sdk: directory, platform: 'win32' }), adb);
    assert.throws(() => findAndroidTool('apkanalyzer', { sdk: directory, platform: 'linux' }), /tool is missing/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('Windows SDK batch arguments reject shell expansion and command injection', () => {
  for (const unsafe of ['app.apk & echo injected', '%PATH%', '!NAME!', 'a"b.apk', 'a\nb.apk', 'a|b.apk', 'a^b.apk', 'a>b.apk']) {
    assert.throws(() => sdkInvocation('C:\\SDK Tools\\apksigner.bat', ['verify', unsafe], { platform: 'win32' }), /Unsupported shell characters/);
  }
  // Linux and adb.exe use direct argument arrays, so shell characters are literal.
  assert.deepEqual(sdkInvocation('/sdk/apksigner', ['a&b.apk'], { platform: 'linux' }).args, ['a&b.apk']);
  assert.equal(sdkInvocation('C:\\SDK Tools\\adb.exe', ['version'], { platform: 'win32' }).command, 'C:\\SDK Tools\\adb.exe');
});

test('Windows SDK batch invocation preserves spaced paths and exact arguments in a real subprocess', { skip: process.platform !== 'win32' }, () => {
  const directory = fs.mkdtempSync(path.join(root, '.test-data', 'android sdk batch '));
  const batch = path.join(directory, 'fake analyzer.bat');
  const echo = path.join(directory, 'echo args.cjs');
  try {
    fs.writeFileSync(echo, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
    fs.writeFileSync(batch, `@echo off\r\n"${process.execPath}" "${echo}" %*\r\n`);
    const args = ['manifest', 'application-id', 'C:\\Downloads\\Bihon Reader\\Bihon (copy).apk'];
    assert.deepEqual(JSON.parse(runAndroidTool(batch, args)), args);
    const emptyArgs = ['', 'path with spaces.apk'];
    assert.deepEqual(JSON.parse(runAndroidTool(batch, emptyArgs)), emptyArgs);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
