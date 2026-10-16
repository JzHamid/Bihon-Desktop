const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bundledNode = path.join(root, 'node_modules/node/bin', process.platform === 'win32' ? 'node.exe' : 'node');
const node = fs.existsSync(bundledNode) ? bundledNode : process.execPath;
const env = { ...process.env, HUSKY: '0', PATH: [path.dirname(node), path.join(root, 'node_modules/.bin'), process.env.PATH].join(path.delimiter) };
function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: root, env, stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(executable)} ${args.join(' ')} failed (${result.status ?? result.signal}).`);
}
function pnpm(args, options = {}) {
  run(node, [path.join(root, 'node_modules/pnpm/bin/pnpm.cjs'), ...args], { cwd: path.join(root, 'vendor/webui'), ...options });
}
module.exports = { root, node, env, run, pnpm };
