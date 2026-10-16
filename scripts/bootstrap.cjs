const fs = require('node:fs/promises');
const path = require('node:path');
const upstream = require('../UPSTREAM.json');
const { platformDetails, runtimeDirectory } = require('../desktop/platform.cjs');
const { downloadVerified, run, extract } = require('./runtime-tools.cjs');
const { prepareWebview } = require('./prepare-webview.cjs');

async function bootstrap(args = process.argv.slice(2)) {
  const options = new Set(args);
  for (const arg of options) if (!['--skip-install', '--skip-ui'].includes(arg)) throw new Error(`Unknown bootstrap option: ${arg}`);
  const root = path.resolve(__dirname, '..');
  const runtime = platformDetails();
  process.chdir(root);
  if (!options.has('--skip-install')) {
    if (process.platform === 'win32') run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci --no-audit --no-fund']);
    else run('npm', ['ci', '--no-audit', '--no-fund']);
  }
  const electronBinary = path.join(root, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  if (!await fs.stat(electronBinary).catch(() => null)) run(process.execPath, [path.join(root, 'node_modules/electron/install.js')]);
  const archive = path.join(root, 'downloads', runtime.asset);
  await downloadVerified(`${upstream.server.url}/releases/download/${upstream.server.tag}/${runtime.asset}`, archive, runtime);
  const destination = runtimeDirectory(root);
  const marker = path.join(destination, '.bihon-verified');
  if (await fs.readFile(marker, 'utf8').catch(() => '') !== runtime.sha256) {
    await extract(archive, path.join(root, 'runtime'));
    await fs.access(path.join(destination, 'bin', 'Suwayomi-Server.jar'));
    await fs.writeFile(marker, runtime.sha256);
  }
  const javac = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac') : 'javac';
  try { run(javac, ['--release', '17', 'desktop/java/BihonServer.java']); }
  catch (error) { throw new Error(`Install a JDK 17 or newer (and set JAVA_HOME if needed) to compile the Java launcher. ${error.message}`); }
  await prepareWebview({ root });
  if (!options.has('--skip-ui')) run(process.execPath, [path.join(root, 'scripts/build-ui.cjs')]);
  console.log('Ready. Run npm start, or npm run dist to build for this platform.');
}

if (require.main === module) bootstrap().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { bootstrap };
