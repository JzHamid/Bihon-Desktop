const path = require('node:path');
const fs = require('node:fs');
const { root, pnpm } = require('./toolchain.cjs');
pnpm(['install', '--frozen-lockfile']);
pnpm(['exec', 'vite', 'build']);
fs.writeFileSync(path.join(root, 'vendor/webui/build/revision'), 'r3379');
