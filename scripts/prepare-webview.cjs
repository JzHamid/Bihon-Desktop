const fs = require('node:fs/promises');
const path = require('node:path');
const { platformDetails, runtimeDirectory } = require('../desktop/platform.cjs');
const { downloadVerified, extract } = require('./runtime-tools.cjs');

async function installWebview({ extracted, destination, platform = process.platform }) {
  await fs.mkdir(destination, { recursive: true });
  // Match upstream CEFManager.linuxMove: the Linux native WebView is entirely
  // under lib, including jcef_helper. Flattening bin as well collides with
  // lib/jfr (directory) versus bin/jfr (Java Flight Recorder executable).
  const directories = platform === 'linux' ? ['lib'] : ['lib', 'bin'];
  for (const directory of directories) {
    for (const entry of await fs.readdir(path.join(extracted, directory))) {
      await fs.cp(path.join(extracted, directory, entry), path.join(destination, entry), { recursive: true, force: true, dereference: true });
    }
  }
  await fs.cp(path.join(extracted, 'legal'), path.join(destination, 'legal'), { recursive: true, force: true, dereference: true });
  await fs.access(path.join(destination, platform === 'win32' ? 'jcef.dll' : 'libjcef.so'));
  if (platform === 'linux') {
    await fs.access(path.join(destination, 'libcef.so'));
    await fs.access(path.join(destination, 'jcef_helper'), require('node:fs').constants.X_OK);
  }
  // This is the same release marker Suwayomi uses. Publish it after all native
  // libraries so interrupted preparation cannot look like a finished install.
  await fs.copyFile(path.join(extracted, 'release'), path.join(destination, 'release'));
}

async function prepareWebview({ root = path.resolve(__dirname, '..') } = {}) {
  const { webview } = platformDetails();
  const filename = `${webview.asset}.tar.gz`;
  const archive = path.join(root, 'downloads', filename);
  await downloadVerified(`https://cache-redirector.jetbrains.com/intellij-jbr/${filename}`, archive, webview);
  const extractionRoot = path.join(root, 'runtime', 'jcef-extracted', webview.asset);
  const marker = path.join(extractionRoot, '.bihon-verified');
  const expected = webview.sha512 || webview.sha256;
  if (await fs.readFile(marker, 'utf8').catch(() => '') !== expected) {
    await extract(archive, extractionRoot);
    await fs.writeFile(marker, expected);
  }
  // Official JBR archives contain one top-level directory. Resolve it from the
  // archive contents; its name is not an API guaranteed by JetBrains.
  const candidates = [extractionRoot, ...(await fs.readdir(extractionRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => path.join(extractionRoot, entry.name))];
  let extracted;
  for (const candidate of candidates) {
    if (await fs.stat(path.join(candidate, 'release')).then(stat => stat.isFile()).catch(() => false)) { extracted = candidate; break; }
  }
  if (!extracted) throw new Error('The pinned WebView archive has no JBR release marker.');
  const destination = path.join(runtimeDirectory(root), 'kcef');
  await installWebview({ extracted, destination });
  console.log('Pinned extension WebView and license notices prepared.');
  return destination;
}

if (require.main === module) prepareWebview().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepareWebview, installWebview };
