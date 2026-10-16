const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root } = require('./toolchain.cjs');

async function main() {
  const directory = path.resolve(process.argv[2] || path.join(root, 'dist'));
  const version = require('../package.json').version;
  const versionPattern = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const currentVersion = new RegExp(`^Bihon-(?:Setup-|Android-)?${versionPattern}(?:-|\\.)`);
  const files = fs.readdirSync(directory).filter(name => currentVersion.test(name) && /\.(exe|AppImage|deb|apk|zip|tar\.gz)$/.test(name)).sort();
  if (!files.length) throw new Error('No release artifacts found.');
  const sums = [];
  for (const name of files) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(path.join(directory, name))) hash.update(chunk);
    sums.push(`${hash.digest('hex')}  ${name}`);
  }
  fs.writeFileSync(path.join(directory, `SHA256SUMS-${require('../package.json').version}.txt`), sums.join('\n') + '\n');
  console.log(`Checksummed ${files.length} release artifacts.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
