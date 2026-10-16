const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const upstream = require('../android/upstream.json');
const defaultDirectory = path.join(root, '.build', 'android');
const trackPath = 'app/src/main/java/eu/kanade/tachiyomi/data/track';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.error || result.status}`);
  return result.stdout;
}

function insideWorkspace(directory) {
  const relative = path.relative(root, path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Android generated source must be in a child directory of this repository.');
  }
  return path.resolve(directory);
}

function replaceOnce(text, before, after, file) {
  if (text.split(before).length !== 2) throw new Error(`Upstream context changed in ${file}`);
  return text.replace(before, after);
}

function androidVersionCode(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Android releases require a numeric major.minor.patch version.');
  const [major, minor, patch] = version.split('.').map(Number);
  if (major > 2099 || minor > 99 || patch > 99) throw new Error('Android version exceeds the supported versionCode range.');
  return major * 1000000 + minor * 10000 + patch * 100;
}

function patchSource(directory, version) {
  const changed = [];
  const update = (file, transform) => {
    const target = path.join(directory, file);
    const original = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    const patched = transform(original);
    if (patched === original) throw new Error(`Patch did not change ${file}`);
    fs.writeFileSync(target, patched);
    changed.push(file);
  };
  const replace = (file, before, after) => update(file, text => replaceOnce(text, before, after, file));

  update('app/build.gradle.kts', text => {
    for (const [before, after] of [
      ['applicationId = "app.mihon"', `applicationId = "${upstream.applicationId}"`],
      ['versionCode = 38', `versionCode = ${androidVersionCode(version)}`],
      ['versionName = "0.21.2"', `versionName = "${version}"`],
      ['System.getenv("MIHON_GITHUB_RELEASE")', 'System.getenv("BIHON_ANDROID_RELEASE")'],
      ['System.getenv("storeFile")', 'System.getenv("BIHON_ANDROID_KEYSTORE_PATH")'],
      ['System.getenv("storePassword")', 'System.getenv("BIHON_ANDROID_KEYSTORE_PASSWORD")'],
      ['System.getenv("keyAlias")', 'System.getenv("BIHON_ANDROID_KEY_ALIAS")'],
      ['System.getenv("keyPassword")', 'System.getenv("BIHON_ANDROID_KEY_PASSWORD")'],
      ['val latestCommitCount = getLatestCommitCount()', 'val latestCommitCount = providers.provider { "1" }'],
      ['val latestCommitSha = getLatestCommitSha()', `val latestCommitSha = providers.provider { "${upstream.revision.slice(0, 12)}" }`],
      ['val latestCommitTime = getLatestCommitTime()', `val latestCommitTime = providers.provider { "${upstream.commitTime}" }`],
    ]) text = replaceOnce(text, before, after, 'app/build.gradle.kts');
    for (const unused of ['getLatestCommitCount', 'getLatestCommitSha', 'getLatestCommitTime']) {
      text = replaceOnce(text, `import mihon.gradle.${unused}\n`, '', 'app/build.gradle.kts');
    }
    // Upstream uses its debug signing config for both release and debug variants.
    // Production builds must provide the persistent Bihon keystore through CI.
    text = replaceOnce(text, '    if (System.getenv("BIHON_ANDROID_RELEASE").toBoolean()) {', `    if (System.getenv("BIHON_ANDROID_RELEASE").toBoolean()) {
        listOf("BIHON_ANDROID_KEYSTORE_PATH", "BIHON_ANDROID_KEYSTORE_PASSWORD", "BIHON_ANDROID_KEY_ALIAS", "BIHON_ANDROID_KEY_PASSWORD").forEach { key ->
            require(!System.getenv(key).isNullOrBlank()) { "Missing Bihon signing environment variable: $key" }
        }`, 'app/build.gradle.kts');
    return text;
  });
  replace('settings.gradle.kts', 'rootProject.name = "Mihon"', 'rootProject.name = "Bihon"');
  replace('i18n/src/commonMain/moko-resources/base/strings.xml', '>Mihon</string>', '>Bihon</string>');
  update('gradle.properties', text => `${text.trimEnd()}\n\n# Bihon does not include upstream telemetry or the Mihon APK updater.\ninclude-telemetry=false\nenable-updater=false\n`);

  // Preserve upstream extension-store links; do not intercept another app's OAuth callbacks.
  update('app/src/main/AndroidManifest.xml', text => {
    const pattern = /        <activity\n            android:name="\.ui\.setting\.track\.TrackLoginActivity"[\s\S]*?        <\/activity>/g;
    if ([...text.matchAll(pattern)].length !== 1) throw new Error('OAuth activity context changed');
    return text.replace(pattern, `        <activity
            android:name=".ui.setting.track.TrackLoginActivity"
            android:exported="false"
            android:label="@string/track_activity_name" />`);
  });
  for (const tracker of upstream.disabledTrackers) {
    const relative = `${trackPath}/${tracker}`;
    const api = fs.readdirSync(path.join(directory, relative)).find(name => name.endsWith('Api.kt'));
    if (!api) throw new Error(`No API implementation for ${tracker}`);
    update(`${relative}/${api}`, text => {
      const pattern = /(private const val CLIENT_(?:ID|SECRET|REFERENCE)\s*=\s*)"[^"\n]*"(?:\s*\+\s*"[^"\n]*")*/g;
      let count = 0;
      text = text.replace(pattern, (_, declaration) => { count++; return `${declaration}""`; });
      if (!count) throw new Error(`No upstream OAuth registration found for ${tracker}`);
      return text;
    });
  }
  update(`${trackPath}/TrackerManager.kt`, text => {
    const before = `    val trackers = listOf(
        mangaBaka,
        myAnimeList,
        aniList,
        kitsu,
        shikimori,
        bangumi,
        komga,
        mangaUpdates,
        kavita,
        suwayomi,
        hikka,
        comick,
    )`;
    return replaceOnce(text, before, `    // Bihon has no registrations for the upstream project's OAuth clients.
    val trackers = listOf(
        komga,
        mangaUpdates,
        kavita,
        suwayomi,
    )`, 'TrackerManager.kt');
  });
  update('app/src/main/java/eu/kanade/tachiyomi/data/updater/AppUpdateChecker.kt', text => {
    return replaceOnce(replaceOnce(text, '"mihonapp/mihon-preview"', '"JzHamid/Bihon-Desktop"', 'AppUpdateChecker.kt'), '"mihonapp/mihon"', '"JzHamid/Bihon-Desktop"', 'AppUpdateChecker.kt');
  });

  const icon = fs.readFileSync(path.join(root, 'desktop/assets/bihon-icon.png'));
  fs.writeFileSync(path.join(directory, 'app/src/main/res/drawable/bihon_mark.png'), icon);
  fs.writeFileSync(path.join(directory, 'app/src/main/res/mipmap/ic_launcher.xml'), `<?xml version="1.0" encoding="utf-8"?>
<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:src="@drawable/bihon_mark"
    android:gravity="fill" />
`);
  changed.push('app/src/main/res/drawable/bihon_mark.png', 'app/src/main/res/mipmap/ic_launcher.xml');
  update('app/src/main/java/eu/kanade/presentation/more/LogoHeader.kt', text => {
    text = replaceOnce(text, 'import androidx.compose.foundation.layout.Column', 'import androidx.compose.foundation.Image\nimport androidx.compose.foundation.layout.Column', 'LogoHeader.kt');
    text = replaceOnce(text, 'import androidx.compose.material3.Icon\n', '', 'LogoHeader.kt');
    text = replaceOnce(text, 'import androidx.compose.material3.MaterialTheme\n', '', 'LogoHeader.kt');
    text = replaceOnce(text, '        Icon(', '        Image(', 'LogoHeader.kt');
    text = replaceOnce(text, 'R.drawable.ic_mihon', 'R.drawable.bihon_mark', 'LogoHeader.kt');
    return replaceOnce(text, '            tint = MaterialTheme.colorScheme.onSurface,\n', '', 'LogoHeader.kt');
  });
  update('app/src/main/java/eu/kanade/presentation/more/settings/screen/about/AboutScreen.kt', text => {
    // Retain upstream support links as attribution; the primary product website points to Bihon.
    text = replaceOnce(text, 'url = "https://mihon.app",', 'url = "https://github.com/JzHamid/Bihon-Desktop",', 'AboutScreen.kt');
    text = replaceOnce(text, 'url = "https://github.com/mihonapp",', 'url = "https://github.com/JzHamid/Bihon-Desktop",', 'AboutScreen.kt');
    return replaceOnce(text, 'uriHandler.openUri("https://mihon.app/privacy/")', 'uriHandler.openUri("https://github.com/JzHamid/Bihon-Desktop/blob/main/docs/android.md#privacy")', 'AboutScreen.kt');
  });

  fs.writeFileSync(path.join(directory, 'BIHON-NOTICE.txt'), `Bihon Android ${version}\nBased on Mihon ${upstream.tag} (${upstream.revision}).\nCopyright the Mihon and Tachiyomi contributors; licensed under Apache-2.0.\nBihon changes: application identity, branding, deterministic provenance, disabled telemetry/updater and unregistered OAuth clients.\nThe original LICENSE, source copyright notices and dependency license viewer are retained.\nBihon Android is distributed separately from the MPL-2.0 Bihon Desktop application.\n`);
  fs.writeFileSync(path.join(directory, 'BIHON-BUILD.md'), `# Bihon Android ${version}\n\nThis is the complete patched source for Bihon Android, based on Mihon ${upstream.tag} at ${upstream.revision}. Use JDK ${upstream.java}, Android SDK platform ${upstream.compileAndroidApi}, and NDK ${upstream.ndk}.\n\nRun ./gradlew assembleRelease testReleaseUnitTest verifySqlDelightMigration -Pdist=foss -Pinclude-telemetry=false -Penable-updater=false (gradlew.bat on Windows). The universal APK is app/build/outputs/apk/release/app-universal-release.apk.\n\nOrdinary local builds use the Android debug signing certificate. Production builds set BIHON_ANDROID_RELEASE=true and BIHON_ANDROID_KEYSTORE_PATH, BIHON_ANDROID_KEYSTORE_PASSWORD, BIHON_ANDROID_KEY_ALIAS, BIHON_ANDROID_KEY_PASSWORD to a persistent private signing identity. Signing material is intentionally absent from this source.\n\nThe Android application ID is ${upstream.applicationId}. Telemetry and the upstream updater are disabled. OAuth trackers without Bihon registrations are unavailable; Komga, Kavita, Suwayomi and MangaUpdates remain available. The upstream LICENSE and all source copyright notices are retained.\n`);
  const assets = path.join(directory, 'app/src/main/assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.copyFileSync(path.join(directory, 'BIHON-NOTICE.txt'), path.join(assets, 'BIHON-NOTICE.txt'));
  fs.copyFileSync(path.join(directory, 'LICENSE'), path.join(assets, 'MIHON-LICENSE.txt'));
  changed.push('BIHON-NOTICE.txt', 'BIHON-BUILD.md', 'app/src/main/assets/BIHON-NOTICE.txt', 'app/src/main/assets/MIHON-LICENSE.txt');
  // The telemetry-disabled fork has no use for the upstream Firebase project configuration.
  fs.unlinkSync(path.join(directory, 'app/google-services.json'));
  return changed.sort();
}

function preparedIdentity(version) {
  return hash(JSON.stringify({ upstream, version, recipe: hash(fs.readFileSync(__filename)), icon: hash(fs.readFileSync(path.join(root, 'desktop/assets/bihon-icon.png'))) }));
}

function verifyPrepared(directory, version) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'BIHON-PREPARED.json'), 'utf8'));
  if (receipt.identity !== preparedIdentity(version)) throw new Error('Generated Android source belongs to a different recipe/version; use a fresh generated directory.');
  for (const [file, expected] of Object.entries(receipt.files)) {
    if (expected === null) {
      if (fs.existsSync(path.join(directory, file))) throw new Error(`Excluded upstream service configuration reappeared: ${file}`);
      continue;
    }
    if (hash(fs.readFileSync(path.join(directory, file))) !== expected) throw new Error(`Generated Android source changed: ${file}`);
  }
  return receipt;
}

async function prepare({ directory = defaultDirectory, archive } = {}) {
  directory = insideWorkspace(directory);
  const version = require('../package.json').version;
  if (fs.existsSync(path.join(directory, 'BIHON-PREPARED.json'))) { verifyPrepared(directory, version); return directory; }
  if (fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error(`Refusing to overwrite a nonempty directory: ${directory}`);
  const cache = path.join(root, 'downloads', `mihon-${upstream.revision}.tar.gz`);
  archive = archive ? path.resolve(archive) : cache;
  if (!fs.existsSync(archive)) {
    if (archive !== cache) throw new Error(`Source archive does not exist: ${archive}`);
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    const response = await fetch(upstream.archive, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Upstream source request failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== upstream.sha256) throw new Error('Upstream source archive SHA-256 mismatch');
    fs.writeFileSync(cache, bytes, { flag: 'wx' });
  }
  if (hash(fs.readFileSync(archive)) !== upstream.sha256) throw new Error('Upstream source archive SHA-256 mismatch');
  const entries = run('tar', ['-tzf', archive]).trim().split(/\r?\n/);
  const prefix = `mihon-${upstream.revision}/`;
  if (entries.some(entry => !entry.startsWith(prefix) || entry.split('/').includes('..') || entry.includes('\\'))) throw new Error('Unsafe upstream archive paths');
  fs.mkdirSync(directory, { recursive: true });
  run('tar', ['-xzf', archive, '--strip-components=1', '-C', directory]);
  const changed = patchSource(directory, version);
  fs.chmodSync(path.join(directory, 'gradlew'), 0o755);
  const files = Object.fromEntries(changed.map(file => [file, hash(fs.readFileSync(path.join(directory, file)))]));
  files['app/google-services.json'] = null;
  fs.writeFileSync(path.join(directory, 'BIHON-PREPARED.json'), `${JSON.stringify({ identity: preparedIdentity(version), version, upstream, files }, null, 2)}\n`);
  return directory;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--directory', '--archive'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: node scripts/android-prepare.cjs [--directory path] [--archive pinned-source.tar.gz]');
    options[args[i].slice(2)] = args[i + 1];
  }
  prepare(options).then(directory => console.log(`Prepared ${upstream.name} Android source: ${directory}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { prepare, patchSource, verifyPrepared, preparedIdentity, androidVersionCode, replaceOnce, insideWorkspace, defaultDirectory, upstream, root, run, hash };
