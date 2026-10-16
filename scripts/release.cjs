const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, node, env, run } = require('./toolchain.cjs');
const version = require('../package.json').version;

const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (status.status !== 0 || status.stdout.trim()) throw new Error(`Commit the version and source changes before building a shareable release.\n${status.stdout || status.stderr || status.error || ''}`);
if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64') throw new Error('Desktop releases currently support Windows x64 and Linux x64.');
Object.assign(env, { ELECTRON_BUILDER_CACHE: path.join(root, 'downloads/builder-cache'), ELECTRON_CACHE: path.join(root, 'downloads/electron-cache') });
run(node, ['scripts/bootstrap.cjs', '--skip-install', '--skip-ui']);
run(node, ['scripts/build-ui.cjs']);
run(node, ['scripts/check.cjs']);
run(node, ['node_modules/electron-builder/cli.js', '--config', 'electron-builder.cjs', ...(process.platform === 'win32' ? ['--win', 'nsis'] : ['--linux', 'AppImage', 'deb']), '--x64', '--publish', 'never']);
run(node, ['scripts/source-archive.cjs']);
for (const name of ['README.md', 'VERIFICATION.md', 'UPDATING.md', 'CHANGELOG.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'UPSTREAM.json']) fs.copyFileSync(path.join(root, name), path.join(root, 'dist', name));
run(node, ['scripts/release-checksums.cjs']);
console.log(`Built Bihon ${version}. Run npm run verify:packaged against the packaged executable before distributing it.`);
