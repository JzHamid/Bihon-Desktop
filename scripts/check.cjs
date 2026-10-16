const fs = require('node:fs');
const path = require('node:path');
const { root, node, run, pnpm } = require('./toolchain.cjs');

const mode = process.argv[2];
if (!mode || mode === 'lint') {
  run(node, ['--check', 'electron-builder.cjs']);
  for (const dir of ['desktop', 'scripts', 'tests']) {
    for (const file of fs.readdirSync(path.join(root, dir))) {
      if (file.endsWith('.cjs')) run(node, ['--check', path.join(dir, file)]);
    }
  }
  pnpm(['exec', 'oxlint', 'src', 'tools']);
}
if (!mode) run(node, ['--test', 'tests/*.test.cjs']);
if (!mode || mode === 'types') {
  run(node, ['vendor/webui/node_modules/typescript/bin/tsc', '--noEmit', '-p', 'vendor/webui/tsconfig.json']);
}
