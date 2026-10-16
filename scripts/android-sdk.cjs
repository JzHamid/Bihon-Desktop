const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./android-prepare.cjs');

function findAndroidTool(name, { sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT, platform = process.platform } = {}) {
  if (!['adb', 'apkanalyzer', 'apksigner'].includes(name)) throw new Error(`Unsupported Android SDK tool: ${name}`);
  const suffix = platform === 'win32' ? (name === 'adb' ? '.exe' : '.bat') : '';
  if (!sdk) {
    if (name === 'adb') return `${name}${suffix}`;
    throw new Error('ANDROID_HOME or ANDROID_SDK_ROOT is required');
  }
  let executable;
  if (name === 'adb') executable = path.join(sdk, 'platform-tools', `${name}${suffix}`);
  else if (name === 'apkanalyzer') executable = path.join(sdk, 'cmdline-tools', 'latest', 'bin', `${name}${suffix}`);
  else {
    const versions = fs.readdirSync(path.join(sdk, 'build-tools')).filter(value => /^\d+\.\d+\.\d+$/.test(value)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!versions.length) throw new Error('Android SDK build-tools are missing');
    executable = path.join(sdk, 'build-tools', versions.at(-1), `${name}${suffix}`);
  }
  if (!fs.existsSync(executable)) throw new Error(`Android SDK tool is missing: ${executable}`);
  return executable;
}

function sdkInvocation(command, args, { platform = process.platform, comSpec = process.env.ComSpec || 'cmd.exe' } = {}) {
  if (platform !== 'win32' || !/\.(?:bat|cmd)$/i.test(command)) return { command, args, options: {} };
  // SDK .bat entrypoints require cmd.exe. Reject expansion/control characters before
  // quoting every token; paths containing spaces and parentheses remain supported.
  for (const value of [command, ...args]) {
    if (typeof value !== 'string' || /[\0\r\n"&|<>^%!]/.test(value)) {
      throw new Error('Unsupported shell characters in Windows Android SDK tool path or argument');
    }
  }
  const line = `"${[command, ...args].map(value => `"${value}"`).join(' ')}"`;
  return { command: comSpec, args: ['/d', '/v:off', '/s', '/c', line], options: { windowsVerbatimArguments: true } };
}

function runAndroidTool(command, args, options = {}) {
  const invocation = sdkInvocation(command, args);
  return run(invocation.command, invocation.args, { ...options, ...invocation.options });
}

module.exports = { findAndroidTool, sdkInvocation, runAndroidTool };
