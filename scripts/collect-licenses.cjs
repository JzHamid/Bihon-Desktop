const fs = require('node:fs/promises');
const path = require('node:path');
async function run() {
  const root = path.resolve(__dirname, '..');
  const store = path.join(root, 'vendor/webui/node_modules/.pnpm');
  const sections = [];
  async function collect(dir) {
    let pkg;
    try { pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')); } catch { return; }
    const entries = await fs.readdir(dir);
    const names = entries.filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
    for (const name of names) {
      const file = path.join(dir, name);
      if ((await fs.stat(file)).isFile()) sections.push(`\n===== ${pkg.name}@${pkg.version} — ${name} =====\n${await fs.readFile(file, 'utf8')}\n`);
    }
  }
  for (const entry of await fs.readdir(store)) {
    const modules = path.join(store, entry, 'node_modules');
    let names; try { names = await fs.readdir(modules, { withFileTypes: true }); } catch { continue; }
    for (const name of names) {
      if (!name.isDirectory() || name.isSymbolicLink()) continue;
      const dir = path.join(modules, name.name);
      if (name.name.startsWith('@')) {
        for (const scoped of await fs.readdir(dir, { withFileTypes: true })) if (scoped.isDirectory() && !scoped.isSymbolicLink()) await collect(path.join(dir, scoped.name));
      } else await collect(dir);
    }
  }
  await fs.mkdir(path.join(root, 'licenses'), { recursive: true });
  await fs.writeFile(path.join(root, 'licenses/UI-DEPENDENCIES.txt'), 'Licenses supplied by pinned upstream UI dependency packages (including build tools).\n' + sections.sort().join('\n'));
  console.log(`Collected ${sections.length} dependency license documents.`);
}
run().catch(e => { console.error(e); process.exitCode = 1; });
