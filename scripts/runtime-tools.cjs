const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawnSync } = require('node:child_process');

async function checksum(file, algorithm) {
  const hash = crypto.createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function downloadVerified(url, destination, spec) {
  const algorithm = spec.sha512 ? 'sha512' : 'sha256', expected = spec[algorithm];
  if (!expected || !new RegExp(`^[a-f0-9]{${algorithm === 'sha512' ? 128 : 64}}$`).test(expected)) throw new Error(`Missing pinned checksum for ${url}.`);
  const present = await fs.stat(destination).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (present) {
    if (await checksum(destination, algorithm) !== expected) throw new Error(`Checksum mismatch for cached ${destination}. Remove that generated download and retry.`);
    return destination;
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const staging = `${destination}.${crypto.randomUUID()}.partial`;
    try {
      console.log(`Downloading ${path.basename(destination)} (attempt ${attempt})`);
      const response = await fetch(url, { signal: AbortSignal.timeout(20 * 60 * 1000) });
      if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(staging, { flags: 'wx' }));
      if (await checksum(staging, algorithm) !== expected) throw new Error(`Checksum mismatch for ${url}.`);
      await fs.rename(staging, destination);
      return destination;
    } catch (error) {
      await fs.unlink(staging).catch(() => {});
      if (attempt === 4 || /Checksum mismatch/.test(error.message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status ?? result.signal}).`);
}

async function extract(archive, destination) {
  await fs.mkdir(destination, { recursive: true });
  // Windows ships bsdtar (including ZIP support); Linux ships GNU tar.
  run(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xf', archive, '-C', destination]);
}

module.exports = { checksum, downloadVerified, run, extract };
