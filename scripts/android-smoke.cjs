const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { root, upstream, defaultDirectory } = require('./android-prepare.cjs');
const { findAndroidTool, runAndroidTool } = require('./android-sdk.cjs');

function assertSameProcess(initialPid, currentPid) {
  if (!/^\d+$/.test(initialPid)) throw new Error('Bihon Android process did not survive launch');
  if (currentPid !== initialPid) throw new Error('Bihon Android process exited or restarted after launch');
}

function assertHealthyLogs({ processLogs, fullLogs, pid, appId = upstream.applicationId }) {
  if (/FATAL EXCEPTION|Fatal signal \d+/.test(processLogs)) throw new Error('Bihon Android logged a Java or native crash during launch');
  const escapedApp = appId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownAnr = new RegExp(`ANR in ${escapedApp}(?=[:\\s(]|$)`);
  const ownTombstone = new RegExp(`>>> ${escapedApp}(?::[A-Za-z0-9_.-]+)? <<<`);
  const ownNativeSignal = fullLogs.split(/\r?\n/).some(line => /Fatal signal \d+/.test(line) && new RegExp(`\\bpid[ :]+${pid}\\b`).test(line));
  if (ownAnr.test(fullLogs) || ownTombstone.test(fullLogs) || ownNativeSignal) throw new Error('Android logged a Bihon native crash or ANR during launch');
}

function captureLogcat(adb, file, execute = runAndroidTool) {
  const descriptor = fs.openSync(file, 'w');
  try {
    // Fresh emulators can emit megabytes of boot logs. Stream diagnostics to
    // disk so spawnSync's default output buffer cannot abort a healthy app.
    execute(adb, ['logcat', '-d', '-v', 'threadtime'], { stdio: ['ignore', descriptor, 'pipe'], timeout: 15000 });
  } finally { fs.closeSync(descriptor); }
}

// Run against a disposable emulator. Never clear or uninstall an existing user's app.
async function smoke(apk = path.join(defaultDirectory, 'app/build/outputs/apk/release/app-universal-release.apk')) {
  const adb = findAndroidTool('adb');
  const output = path.join(root, 'artifacts/android-smoke');
  fs.mkdirSync(output, { recursive: true });
  const command = (args, options) => runAndroidTool(adb, args, options);
  const appId = upstream.applicationId;
  const before = command(['shell', 'pm', 'list', 'packages', appId]);
  if (before.split(/\r?\n/).some(line => line.trim() === `package:${appId}`)) throw new Error('Android smoke requires a fresh emulator without Bihon installed');
  command(['wait-for-device']);
  command(['install', '--no-streaming', apk]);
  try {
    const launch = command(['shell', 'am', 'start', '-W', '-n', `${appId}/eu.kanade.tachiyomi.ui.main.MainActivity`]);
    fs.writeFileSync(path.join(output, 'launch.txt'), launch);
    if (!/Status:\s*ok/.test(launch)) throw new Error('Bihon Android activity did not start');
    const initialPid = command(['shell', 'pidof', appId]).trim();
    fs.writeFileSync(path.join(output, 'process.json'), `${JSON.stringify({ applicationId: appId, initialPid }, null, 2)}\n`);
    assertSameProcess(initialPid, initialPid);
    await sleep(12000);
    const pid = command(['shell', 'pidof', appId]).trim();
    fs.writeFileSync(path.join(output, 'process.json'), `${JSON.stringify({ applicationId: appId, initialPid, settledPid: pid }, null, 2)}\n`);
    assertSameProcess(initialPid, pid);
    const activity = command(['shell', 'dumpsys', 'activity', 'activities']);
    fs.writeFileSync(path.join(output, 'activities.txt'), activity);
    if (!activity.split(/\r?\n/).some(line => /(?:mResumedActivity|topResumedActivity)/.test(line) && line.includes(appId))) throw new Error('Bihon Android is not the resumed app');
    const logs = command(['logcat', '-d', '-b', 'crash', '-b', 'system', '-t', '2000', '-v', 'threadtime'], { maxBuffer: 16 * 1024 * 1024, timeout: 15000 });
    fs.writeFileSync(path.join(output, 'crash-system-logcat.txt'), logs);
    const processLogs = command(['logcat', '-d', `--pid=${pid}`, '-t', '2000', '-v', 'threadtime'], { maxBuffer: 16 * 1024 * 1024, timeout: 15000 });
    fs.writeFileSync(path.join(output, 'bihon-logcat.txt'), processLogs);
    assertHealthyLogs({ processLogs, fullLogs: logs, pid, appId });
    const xml = command(['shell', 'uiautomator', 'dump', '/sdcard/bihon-smoke.xml']);
    fs.writeFileSync(path.join(output, 'ui-dump.txt'), xml);
    command(['pull', '/sdcard/bihon-smoke.xml', path.join(output, 'onboarding.xml')]);
    const ui = fs.readFileSync(path.join(output, 'onboarding.xml'), 'utf8');
    if (!ui.includes(`package="${appId}"`)) throw new Error('Bihon Android did not render its onboarding UI');
    console.log('Android smoke passed: APK installed, onboarding rendered, process remained foreground, no crash or ANR.');
  } finally {
    try { captureLogcat(adb, path.join(output, 'logcat.txt')); } catch {}
    try { command(['shell', 'screencap', '-p', '/sdcard/bihon-smoke.png']); command(['pull', '/sdcard/bihon-smoke.png', path.join(output, 'onboarding.png')]); } catch {}
  }
}

if (require.main === module) smoke(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { smoke, assertSameProcess, assertHealthyLogs, captureLogcat };
