const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { root, upstream, defaultDirectory, run } = require('./android-prepare.cjs');

// Run against a disposable emulator. Never clear or uninstall an existing user's app.
async function smoke(apk = path.join(defaultDirectory, 'app/build/outputs/apk/release/app-universal-release.apk')) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const adb = sdk ? path.join(sdk, 'platform-tools', 'adb') : 'adb';
  const output = path.join(root, 'artifacts/android-smoke');
  fs.mkdirSync(output, { recursive: true });
  const command = args => run(adb, args);
  const appId = upstream.applicationId;
  const before = command(['shell', 'pm', 'list', 'packages', appId]);
  if (before.split(/\r?\n/).some(line => line.trim() === `package:${appId}`)) throw new Error('Android smoke requires a fresh emulator without Bihon installed');
  command(['wait-for-device']);
  command(['install', '--no-streaming', apk]);
  command(['logcat', '-c']);
  try {
    const launch = command(['shell', 'am', 'start', '-W', '-n', `${appId}/eu.kanade.tachiyomi.ui.main.MainActivity`]);
    fs.writeFileSync(path.join(output, 'launch.txt'), launch);
    if (!/Status:\s*ok/.test(launch)) throw new Error('Bihon Android activity did not start');
    await sleep(12000);
    const pid = command(['shell', 'pidof', appId]).trim();
    if (!/^\d+(?:\s+\d+)*$/.test(pid)) throw new Error('Bihon Android process exited after launch');
    const activity = command(['shell', 'dumpsys', 'activity', 'activities']);
    fs.writeFileSync(path.join(output, 'activities.txt'), activity);
    if (!activity.split(/\r?\n/).some(line => /(?:mResumedActivity|topResumedActivity)/.test(line) && line.includes(appId))) throw new Error('Bihon Android is not the resumed app');
    const logs = command(['logcat', '-d', '-v', 'threadtime']);
    fs.writeFileSync(path.join(output, 'logcat.txt'), logs);
    if (/FATAL EXCEPTION|Fatal signal \d+|ANR in app\.bihon\.android/.test(logs)) throw new Error('Android logged a crash or ANR during launch');
    const xml = command(['shell', 'uiautomator', 'dump', '/sdcard/bihon-smoke.xml']);
    fs.writeFileSync(path.join(output, 'ui-dump.txt'), xml);
    command(['pull', '/sdcard/bihon-smoke.xml', path.join(output, 'onboarding.xml')]);
    const ui = fs.readFileSync(path.join(output, 'onboarding.xml'), 'utf8');
    if (!ui.includes(`package="${appId}"`)) throw new Error('Bihon Android did not render its onboarding UI');
    console.log('Android smoke passed: APK installed, onboarding rendered, process remained foreground, no crash or ANR.');
  } finally {
    try { fs.writeFileSync(path.join(output, 'logcat.txt'), command(['logcat', '-d', '-v', 'threadtime'])); } catch {}
    try { command(['shell', 'screencap', '-p', '/sdcard/bihon-smoke.png']); command(['pull', '/sdcard/bihon-smoke.png', path.join(output, 'onboarding.png')]); } catch {}
  }
}

if (require.main === module) smoke(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { smoke };
