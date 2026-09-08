// Bihon additions, MPL-2.0. Snapshot the closed engine before opening a newer version.
const path = require('node:path');
const fs = require('node:fs/promises');
const { readJson, writeJson, digest } = require('./storage.cjs');
const SNAPSHOT_ITEMS = ['database.mv.db', 'database.h2.db', 'server.conf', 'desktop-settings.json', 'default-repository.json', 'books.json', 'books', 'settings', 'extensions'];
function compareVersions(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; }
  return 0;
}
async function listFiles(root, relative) {
  const target = path.join(root, relative);
  const stat = await fs.lstat(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
  if (!stat) return [];
  if (stat.isSymbolicLink()) throw new Error(`Upgrade backup cannot follow linked paths: ${relative}`);
  if (stat.isFile()) return [{ name: relative, size: stat.size }];
  if (!stat.isDirectory()) throw new Error(`Unsupported backup file: ${relative}`);
  const files = [];
  for (const name of await fs.readdir(target)) files.push(...await listFiles(root, path.join(relative, name)));
  return files;
}
async function prepareUpgrade({ stateDir, version, copyFile = fs.copyFile, availableBytes }) {
  const marker = path.join(stateDir, 'upgrade-state.json');
  const state = await readJson(marker, {});
  if (state.lastSuccessfulVersion === version) return null;
  if (state.lastSuccessfulVersion && compareVersions(state.lastSuccessfulVersion, version) > 0) throw new Error(`This library was opened by Bihon ${state.lastSuccessfulVersion}. Install that version or newer.`);
  const files = (await Promise.all(SNAPSHOT_ITEMS.map(name => listFiles(stateDir, name)))).flat();
  if (!files.some(file => /database\.(mv|h2)\.db$/.test(file.name))) return null;
  const from = state.lastSuccessfulVersion || '0.1.0';
  const backupName = `${from}-to-${version}-${Date.now()}`;
  const pending = state.pending?.to === version ? state.pending : { from, to: version, name: backupName };
  if (!/^[\d.a-z-]+$/i.test(pending.name)) throw new Error('Invalid saved upgrade backup path.');
  const destination = path.join(stateDir, 'backups/bihon-upgrades', pending.name);
  await fs.mkdir(destination, { recursive: true });
  const complete = await readJson(path.join(destination, 'manifest.json'), null);
  if (complete) {
    for (const file of complete.files) {
      if (path.isAbsolute(file.name) || file.name.split(/[\\/]/).includes('..')) throw new Error('Invalid backup manifest path.');
      if (await digest(path.join(destination, file.name)) !== file.sha256) throw new Error('Upgrade backup verification failed. Your existing library has not been changed.');
    }
    return destination;
  }
  const disk = await fs.statfs(destination);
  const free = availableBytes ?? Number(disk.bavail) * Number(disk.bsize);
  if (free < files.reduce((sum, file) => sum + file.size, 0) + 16 * 1024 * 1024) throw new Error('Not enough space for a pre-update library backup. Free some space and reopen Bihon.');
  await writeJson(marker, { ...state, pending });
  const manifest = [];
  for (const file of files) {
    const source = path.join(stateDir, file.name), target = path.join(destination, file.name);
    const sha256 = await digest(source);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    const handle = await fs.open(target, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    if (await digest(target) !== sha256 || await digest(source) !== sha256) throw new Error(`Upgrade backup verification failed: ${file.name}`);
    manifest.push({ ...file, sha256 });
  }
  await writeJson(path.join(destination, 'manifest.json'), { from, to: version, createdAt: new Date().toISOString(), files: manifest });
  return destination;
}
async function markVersionStarted(stateDir, version, snapshot) {
  const marker = path.join(stateDir, 'upgrade-state.json');
  const state = await readJson(marker, {});
  await writeJson(marker, { lastSuccessfulVersion: version, lastUpgradeBackup: snapshot || state.lastUpgradeBackup || null });
}
module.exports = { prepareUpgrade, markVersionStarted, compareVersions };
