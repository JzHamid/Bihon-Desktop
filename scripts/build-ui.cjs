const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const node = path.join(root, 'node_modules/node/bin/node.exe');
const pnpm = path.join(root, 'node_modules/pnpm/bin/pnpm.cjs');
const env = { ...process.env, HUSKY: '0', PATH: `${path.dirname(node)};${path.join(root, "node_modules/.bin")};${process.env.PATH}` };
for (const args of [['install', '--frozen-lockfile'], ['exec', 'vite', 'build']]) {
  const result = spawnSync(node, [pnpm, ...args], { cwd: path.join(root, 'vendor/webui'), env, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
fs.writeFileSync(path.join(root, 'vendor/webui/build/revision'), 'r3379');
