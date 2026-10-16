const path = require('node:path');
const os = require('node:os');
const upstream = require('../UPSTREAM.json');

function platformDetails(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const runtime = upstream.runtime.platforms[key];
  if (!runtime) throw new Error(`Bihon supports Windows x64 and Linux x64. Unsupported platform: ${key}.`);
  return { ...runtime, webview: upstream.runtime.webview[key], paths: platform === 'win32' ? path.win32 : path.posix, platform };
}

function stateDirectory({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (env.BIHON_DATA_DIR) return paths.resolve(env.BIHON_DATA_DIR);
  if (platform === 'win32') return paths.join(env.LOCALAPPDATA || paths.join(home, 'AppData', 'Local'), 'Bihon');
  if (platform === 'linux') {
    // XDG directories must be absolute. Ignore a relative value rather than
    // silently placing a library under the process working directory.
    const dataHome = env.XDG_DATA_HOME && paths.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : paths.join(home, '.local', 'share');
    return paths.join(dataHome, 'Bihon');
  }
  throw new Error(`Unsupported Bihon platform: ${platform}.`);
}

function runtimeDirectory(root, platform = process.platform, arch = process.arch) {
  const { directory, paths } = platformDetails(platform, arch);
  return paths.join(root, 'runtime', directory);
}

function samePath(left, right, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const first = paths.resolve(left), second = paths.resolve(right);
  return platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

function javaInvocation({ runtime, wrapper, stateDir, tempDir, enforced, platform = process.platform, arch = process.arch }) {
  const { paths } = platformDetails(platform, arch);
  return {
    executable: paths.join(runtime, 'jre', 'bin', platform === 'win32' ? 'java.exe' : 'java'),
    args: [
      `-Djava.io.tmpdir=${tempDir}`,
      '-Xmx1024m', `-Dsuwayomi.tachidesk.config.server.rootDir=${stateDir}`,
      ...Object.entries(enforced).map(([key, value]) => `-Dsuwayomi.tachidesk.config.server.${key}=${JSON.stringify(value)}`),
      '-cp', `${wrapper}${paths.delimiter}${paths.join(runtime, 'bin', 'Suwayomi-Server.jar')}`, 'BihonServer',
    ],
  };
}

function serverEnvironment({ runtime, platform = process.platform, env = process.env }) {
  if (platform !== 'linux') return { ...env };
  // The pinned upstream Linux launcher preloads its SIGTRAP handler to keep
  // Chromium WebView aborts from taking down the server JVM.
  const handler = path.posix.join(runtime, 'bin', 'catch_abort.so');
  // ld.so cannot escape spaces or colons in LD_PRELOAD entries. The normal
  // .deb/AppImage installation paths contain neither; omit the optional guard
  // for a developer-selected path that the loader cannot represent.
  return /[\s:]/.test(handler) ? { ...env } : { ...env, LD_PRELOAD: [handler, env.LD_PRELOAD].filter(Boolean).join(':') };
}

function updateInstructions(platform = process.platform) {
  return platform === 'win32'
    ? 'Close Bihon and run the newer Bihon Setup installer.'
    : 'Close Bihon and install the newer .deb package, or replace your AppImage with the newer one.';
}

module.exports = { platformDetails, stateDirectory, runtimeDirectory, samePath, javaInvocation, serverEnvironment, updateInstructions };
