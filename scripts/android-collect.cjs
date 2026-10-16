const fs = require('node:fs');
const path = require('node:path');
const { root, defaultDirectory, upstream, verifyPrepared, androidVersionCode, hash } = require('./android-prepare.cjs');
const { findAndroidTool, runAndroidTool } = require('./android-sdk.cjs');

function normalizeFingerprint(value) {
  const fingerprint = value.replace(/:/g, '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Expected a SHA-256 signing certificate fingerprint');
  return fingerprint;
}

function signerCertificates(signature) {
  // AOSP ApkSignerTool.verify prints numbered signers for v1/v2/v3 and
  // SDK-range labels for v3.1. The same identity may be printed for both ranges.
  // Source: android.googlesource.com/platform/tools/apksig/+/refs/heads/main/
  // src/apksigner/java/com/android/apksigner/ApkSignerTool.java (verify method).
  const label = '(?:#\\d+|\\(minSdkVersion=\\d+(?: \\(dev release=true\\))?, maxSdkVersion=\\d+\\))';
  const text = signature.replace(/\r\n/g, '\n');
  const count = text.match(/^Number of signers: (\d+)$/m);
  if (count && Number(count[1]) !== 1) throw new Error('APK must have exactly one verified signing certificate');
  const digests = [...text.matchAll(new RegExp(`^Signer ${label} certificate SHA-256 digest: ([a-fA-F0-9:]+)$`, 'gm'))].map(match => normalizeFingerprint(match[1]));
  const subjects = [...text.matchAll(new RegExp(`^Signer ${label} certificate DN: (.+)$`, 'gm'))].map(match => match[1]);
  const identities = [...new Set(digests)];
  if (identities.length !== 1 || subjects.length !== digests.length) throw new Error('APK must have exactly one verified signing certificate');
  return { fingerprint: identities[0], subjects };
}

function verifyApk(apk, fingerprint, execute = runAndroidTool, tools = {}, testBuild = false) {
  const version = require('../package.json').version;
  const analyzer = tools.apkanalyzer || findAndroidTool('apkanalyzer');
  const signer = tools.apksigner || findAndroidTool('apksigner');
  const manifest = field => execute(analyzer, ['manifest', field, apk]).trim();
  if (manifest('application-id') !== upstream.applicationId) throw new Error('APK has the wrong application ID');
  if (manifest('version-name') !== version) throw new Error('APK has the wrong release version');
  if (manifest('version-code') !== String(androidVersionCode(version))) throw new Error('APK has the wrong versionCode');
  if (manifest('min-sdk') !== String(upstream.minimumAndroidApi)) throw new Error('APK has the wrong minimum Android API');
  const signature = execute(signer, ['verify', '--verbose', '--print-certs', apk]);
  const certificates = signerCertificates(signature);
  if (testBuild && !certificates.subjects.every(subject => /(?:^|,\s*)CN=Android Debug(?:,|$)/.test(subject))) throw new Error('Test APK must use the disposable Android Debug signing identity');
  if ((!testBuild || fingerprint) && certificates.fingerprint !== normalizeFingerprint(fingerprint)) throw new Error('APK signing certificate does not match the expected persistent Bihon identity');
  return { applicationId: upstream.applicationId, version, versionCode: androidVersionCode(version), minimumAndroidApi: upstream.minimumAndroidApi, certificateSha256: certificates.fingerprint };
}

function collect({ directory = defaultDirectory, certificateSha256, testBuild = false } = {}) {
  if (!testBuild && !certificateSha256) throw new Error('Pass --certificate-sha256 (expected public release certificate digest)');
  const version = require('../package.json').version;
  verifyPrepared(directory, version);
  const apk = path.join(directory, 'app/build/outputs/apk/release/app-universal-release.apk');
  const execute = (command, args) => {
    const output = runAndroidTool(command, args);
    if (args.includes('--print-certs')) {
      const evidence = path.join(root, 'artifacts/android-apk-signature.txt');
      fs.mkdirSync(path.dirname(evidence), { recursive: true });
      fs.writeFileSync(evidence, output);
    }
    return output;
  };
  const metadata = verifyApk(apk, certificateSha256, execute, {}, testBuild);
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
module.exports = { collect, verifyApk, normalizeFingerprint, signerCertificates };
