const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  const handle = await fs.open(temp, 'w');
  try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temp, file);
}
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}
async function assertNoLinks(target) {
  let current = path.resolve(target);
  for (;;) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error('Linked folders are not supported for download migration. Choose a regular folder.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
async function inventory(root, relative = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Cannot migrate a linked file or folder: ${name}`);
    if (entry.isDirectory()) result.push(...await inventory(root, name));
    else if (entry.isFile()) result.push({ name, size: (await fs.stat(path.join(root, name))).size });
    else throw new Error(`Unsupported download file: ${name}`);
  }
  return result;
}
async function removeEmptyDirectories(root) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) await removeEmptyDirectories(path.join(root, entry.name));
  }
  try { await fs.rmdir(root); } catch (e) { if (!['ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e; }
}

// The caller stops the server before invoking migration/recovery. The journal is
// persisted before any copying; originals remain intact until the setting commits.
async function migrate({ stateDir, source, destination, commit, progress = () => {}, freeSpace, checkpoint = async () => {} }) {
  const journalFile = path.join(stateDir, 'download-migration.json');
  let journal = await readJson(journalFile, null);
  if (!journal) {
    source = path.resolve(source); destination = path.resolve(destination);
    if (source.toLowerCase() === destination.toLowerCase()) return;
    await fs.mkdir(source, { recursive: true });
    await fs.mkdir(destination, { recursive: true });
    await assertNoLinks(source); await assertNoLinks(destination);
    source = await fs.realpath(source); destination = await fs.realpath(destination);
    if (inside(source, destination) || inside(destination, source) || source === destination) {
      throw new Error('Choose a folder outside the current download folder, and not one of its parents.');
    }
    if ((await fs.readdir(destination)).length) throw new Error('Choose an empty folder so existing files cannot be overwritten.');
    const probe = path.join(destination, `.bihon-write-test-${crypto.randomUUID()}`);
    await fs.writeFile(probe, 'test', { flag: 'wx' }); await fs.unlink(probe);
    const files = await inventory(source);
    const bytes = files.reduce((total, file) => total + file.size, 0);
    const disk = freeSpace === undefined ? await fs.statfs(destination) : null;
    const available = freeSpace ?? disk.bavail * disk.bsize;
    if (available < bytes + 16 * 1024 * 1024) throw new Error('Not enough free space in the selected download folder.');
    journal = { version: 1, source, destination, files, stage: 'copying' };
    await writeJson(journalFile, journal);
  }
  ({ source, destination } = journal);
  await assertNoLinks(source); await assertNoLinks(destination);
  if (inside(source, destination) || inside(destination, source) || source === destination) throw new Error('Invalid migration paths.');
  for (const file of journal.files) {
    if (!inside(source, path.resolve(source, file.name)) || !inside(destination, path.resolve(destination, file.name))) throw new Error('Invalid migration file path.');
  }
  if (journal.stage === 'copying') {
    let completed = 0;
    for (const file of journal.files) {
      const from = path.join(source, file.name), to = path.join(destination, file.name);
      await assertNoLinks(from);
      const original = await digest(from);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await assertNoLinks(path.dirname(to));
      const existing = await fs.lstat(to).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
      if (existing?.isSymbolicLink()) throw new Error('A linked destination file was found.');
      if (existing && await digest(to) !== original) throw new Error(`Destination conflict: ${file.name}. Originals are safe.`);
      if (!existing) {
        const temp = `${to}.bihon-partial`;
        // A unique sibling temporary file prevents overwriting unrelated content.
        const staging = `${temp}-${crypto.randomUUID()}`;
        await fs.copyFile(from, staging, require('node:fs').constants.COPYFILE_EXCL);
        if (await digest(staging) !== original) throw new Error(`Verification failed: ${file.name}`);
        await fs.rename(staging, to);
      }
      file.hash = original;
      progress({ stage: 'copying', completed: ++completed, total: journal.files.length });
      await checkpoint('copied', file);
    }
    // Recheck all copies before committing, including files copied before a crash.
    for (const file of journal.files) {
      if (await digest(path.join(source, file.name)) !== file.hash || await digest(path.join(destination, file.name)) !== file.hash) throw new Error('Downloads changed during migration. Originals were preserved.');
    }
    journal.stage = 'verified'; await writeJson(journalFile, journal);
  }
  if (journal.stage === 'verified') {
    for (const file of journal.files) {
      await assertNoLinks(path.join(source, file.name));
      await assertNoLinks(path.join(destination, file.name));
      if (await digest(path.join(source, file.name)) !== file.hash || await digest(path.join(destination, file.name)) !== file.hash) throw new Error('Verified files changed before settings could be saved. Originals were preserved.');
    }
    await commit(destination);
    await checkpoint('committed');
    journal.stage = 'cleanup'; await writeJson(journalFile, journal);
  }
  for (const file of journal.files) {
    const from = path.join(source, file.name), to = path.join(destination, file.name);
    const exists = await fs.lstat(from).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    if (!exists) continue;
    await assertNoLinks(from); await assertNoLinks(to);
    if (await digest(from) !== file.hash || await digest(to) !== file.hash) throw new Error('A file changed; remaining originals were preserved for recovery.');
    await fs.unlink(from);
  }
  // Keep the root: recovery after interruption must still be able to validate it.
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) await removeEmptyDirectories(path.join(source, entry.name));
  }
  await fs.unlink(journalFile);
  progress({ stage: 'complete', completed: journal.files.length, total: journal.files.length });
}
module.exports = { readJson, writeJson, migrate, digest, inside };
