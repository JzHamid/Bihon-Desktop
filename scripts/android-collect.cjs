const fs = require('node:fs');
const path = require('node:path');
const { root, defaultDirectory, upstream, verifyPrepared, androidVersionCode, run, hash } = require('./android-prepare.cjs');

function normalizeFingerprint(value) {
  const fingerprint = value.replace(/:/g, '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Expected a SHA-256 signing certificate fingerprint');
  return fingerprint;
}

function findAndroidTool(name) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT is required');
  if (name === 'apkanalyzer') return path.join(sdk, 'cmdline-tools', 'latest', 'bin', name);
  const versions = fs.readdirSync(path.join(sdk, 'build-tools')).filter(value => /^\d+\.\d+\.\d+$/.test(value)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!versions.length) throw new Error('Android SDK build-tools are missing');
  return path.join(sdk, 'build-tools', versions.at(-1), name);
}

function verifyApk(apk, fingerprint, execute = run, tools = {}, testBuild = false) {
  const version = require('../package.json').version;
  const analyzer = tools.apkanalyzer || findAndroidTool('apkanalyzer');
  const signer = tools.apksigner || findAndroidTool('apksigner');
  const manifest = field => execute(analyzer, ['manifest', field, apk]).trim();
  if (manifest('application-id') !== upstream.applicationId) throw new Error('APK has the wrong application ID');
  if (manifest('version-name') !== version) throw new Error('APK has the wrong release version');
  if (manifest('version-code') !== String(androidVersionCode(version))) throw new Error('APK has the wrong versionCode');
  if (manifest('min-sdk') !== String(upstream.minimumAndroidApi)) throw new Error('APK has the wrong minimum Android API');
  const signature = execute(signer, ['verify', '--verbose', '--print-certs', apk]);
  const digests = [...signature.matchAll(/Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/g)].map(match => normalizeFingerprint(match[1]));
  if (digests.length !== 1) throw new Error('APK must have exactly one verified signing certificate');
  if (testBuild && !/Signer #1 certificate DN:.*CN=Android Debug(?:,|$)/m.test(signature)) throw new Error('Test APK must use the disposable Android Debug signing identity');
  if ((!testBuild || fingerprint) && digests[0] !== normalizeFingerprint(fingerprint)) throw new Error('APK signing certificate does not match the expected persistent Bihon identity');
  return { applicationId: upstream.applicationId, version, versionCode: androidVersionCode(version), minimumAndroidApi: upstream.minimumAndroidApi, certificateSha256: digests[0] };
}

function collect({ directory = defaultDirectory, certificateSha256, testBuild = false } = {}) {
  if (!testBuild && !certificateSha256) throw new Error('Pass --certificate-sha256 (expected public release certificate digest)');
  const version = require('../package.json').version;
  verifyPrepared(directory, version);
  const apk = path.join(directory, 'app/build/outputs/apk/release/app-universal-release.apk');
  const metadata = verifyApk(apk, certificateSha256, run, {}, testBuild);
  const target = path.join(root, 'dist', `Bihon-Android-${version}${testBuild ? '-test' : ''}.apk`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(apk, target);
  const receipt = { ...metadata, testBuild, upstream: upstream.revision, apkSha256: hash(fs.readFileSync(target)) };
  fs.writeFileSync(`${target}.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Verified signed APK: ${target}`);
  return receipt;
}

if (require.main === module) {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--test-build') { options.testBuild = true; i--; continue; }
    if (!['--directory', '--certificate-sha256'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: node scripts/android-collect.cjs (--certificate-sha256 digest | --test-build) [--directory path]');
    options[args[i] === '--directory' ? 'directory' : 'certificateSha256'] = args[i + 1];
  }
  collect(options);
}
module.exports = { collect, verifyApk, normalizeFingerprint };
