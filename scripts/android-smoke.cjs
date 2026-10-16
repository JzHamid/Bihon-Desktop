const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { root, upstream, defaultDirectory } = require('./android-prepare.cjs');
const { findAndroidTool, runAndroidTool } = require('./android-sdk.cjs');
const { readDefaultStoreEvidence } = require('./android-store-evidence.cjs');

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

function captureStoreEvidence(command, output, phase) {
  // Stop only this fresh test installation before copying its committed DB/WAL.
  command(['shell', 'am', 'force-stop', upstream.applicationId]);
  const temporary = fs.mkdtempSync(path.join(output, '.store-' + phase + '-'));
  const data = '/data/data/' + upstream.applicationId;
  try {
    const files = command(['shell', 'ls', '-1', data + '/databases']).trim().split(/\r?\n/);
    if (!files.includes('tachiyomi.db')) throw new Error('Android did not create its library database');
    for (const name of ['tachiyomi.db', 'tachiyomi.db-wal', 'tachiyomi.db-shm']) {
      if (files.includes(name)) command(['pull', data + '/databases/' + name, path.join(temporary, name)]);
    }
    const preferences = command(['shell', 'cat', data + '/shared_prefs/' + upstream.applicationId + '_preferences.xml']);
    const evidence = readDefaultStoreEvidence(path.join(temporary, 'tachiyomi.db'), preferences);
    fs.writeFileSync(path.join(output, 'default-store-' + phase + '.json'), JSON.stringify(evidence, null, 2) + '\n');
    return evidence;
  } finally {
    if (path.dirname(temporary) !== output) throw new Error('Unexpected Android evidence cleanup path');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

// Run against a disposable emulator. Never clear or uninstall an existing user's app.
async function smoke(apk = path.join(defaultDirectory, 'app/build/outputs/apk/release/app-universal-release.apk')) {
  const adb = findAndroidTool('adb');
  const output = path.join(root, 'artifacts/android-smoke');
  fs.mkdirSync(output, { recursive: true });
  const command = (args, options) => runAndroidTool(adb, args, options);
  const appId = upstream.applicationId;
  if (command(['shell', 'getprop', 'ro.kernel.qemu']).trim() !== '1') throw new Error('Android smoke requires a disposable emulator, not a physical device');
  const before = command(['shell', 'pm', 'list', 'packages', appId]);
  if (before.split(/\r?\n/).some(line => line.trim() === `package:${appId}`)) throw new Error('Android smoke requires a fresh emulator without Bihon installed');
  command(['root']);
  command(['wait-for-device'], { timeout: 30000 });
  if (command(['shell', 'id', '-u']).trim() !== '0') throw new Error('Android store verification requires a rooted disposable emulator');
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
    command(['shell', 'screencap', '-p', '/sdcard/bihon-smoke.png']);
    command(['pull', '/sdcard/bihon-smoke.png', path.join(output, 'onboarding.png')]);
    const firstStore = captureStoreEvidence(command, output, 'first-launch');
    const restart = command(['shell', 'am', 'start', '-W', '-n', `${appId}/eu.kanade.tachiyomi.ui.main.MainActivity`]);
    fs.writeFileSync(path.join(output, 'restart.txt'), restart);
    if (!/Status:\s*ok/.test(restart)) throw new Error('Bihon Android activity did not restart');
    const restartInitialPid = command(['shell', 'pidof', appId]).trim();
    await sleep(5000);
    const restartSettledPid = command(['shell', 'pidof', appId]).trim();
    assertSameProcess(restartInitialPid, restartSettledPid);
    const restartedActivity = command(['shell', 'dumpsys', 'activity', 'activities']);
    if (!restartedActivity.split(/\r?\n/).some(line => /(?:mResumedActivity|topResumedActivity)/.test(line) && line.includes(appId))) throw new Error('Bihon Android did not remain foreground after restart');
    const restartedLogs = command(['logcat', '-d', `--pid=${restartSettledPid}`, '-t', '2000', '-v', 'threadtime'], { maxBuffer: 16 * 1024 * 1024, timeout: 15000 });
    const restartedSystem = command(['logcat', '-d', '-b', 'crash', '-b', 'system', '-t', '2000', '-v', 'threadtime'], { maxBuffer: 16 * 1024 * 1024, timeout: 15000 });
    assertHealthyLogs({ processLogs: restartedLogs, fullLogs: restartedSystem, pid: restartSettledPid, appId });
    fs.writeFileSync(path.join(output, 'restart-bihon-logcat.txt'), restartedLogs);
    fs.writeFileSync(path.join(output, 'process.json'), JSON.stringify({ applicationId: appId, initialPid, settledPid: pid, restartInitialPid, restartSettledPid }, null, 2) + '\n');
    const restartedStore = captureStoreEvidence(command, output, 'restart');
    if (JSON.stringify(firstStore) !== JSON.stringify(restartedStore)) throw new Error('Android restart duplicated or changed the configured extension store');
    console.log('Android smoke passed: onboarding and restart healthy; native Keiyoushi store, signing pin and one-time marker persisted without duplicates.');
  } finally {
    try { captureLogcat(adb, path.join(output, 'logcat.txt')); } catch {}
    if (!fs.existsSync(path.join(output, 'onboarding.png'))) {
      try { command(['shell', 'screencap', '-p', '/sdcard/bihon-smoke.png']); command(['pull', '/sdcard/bihon-smoke.png', path.join(output, 'onboarding.png')]); } catch {}
    }
  }
}

if (require.main === module) smoke(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { smoke, assertSameProcess, assertHealthyLogs, captureLogcat };
