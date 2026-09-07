const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { writeJson } = require('./storage.cjs');

async function freePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve)); return port;
}
class Server {
  constructor({ stateDir, runtime, ui, wrapper }) { Object.assign(this, { stateDir, runtime, ui, wrapper }); }
  async start(settings) {
    if (this.child) throw new Error('Server is already running.');
    this.port = settings.port || await freePort();
    this.url = `http://127.0.0.1:${this.port}`;
    await fs.mkdir(this.stateDir, { recursive: true });
    await fs.mkdir(settings.downloadsPath, { recursive: true });
    const bundledCef = path.join(this.runtime, 'kcef');
    const installedCef = path.join(this.stateDir, 'bin/kcef');
    const bundledRelease = await fs.readFile(path.join(bundledCef, 'release'), 'utf8');
    const installedRelease = await fs.readFile(path.join(installedCef, 'release'), 'utf8').catch(() => '');
    if (bundledRelease !== installedRelease) {
      await fs.cp(bundledCef, installedCef, { recursive: true, force: true, filter: source => path.basename(source) !== 'release' });
      // Copy the marker last so interrupted first-run setup retries.
      await fs.writeFile(path.join(installedCef, 'release'), bundledRelease);
    }
    await fs.cp(this.ui, path.join(this.stateDir, 'webUI'), { recursive: true, force: true });
    const conf = path.join(this.stateDir, 'server.conf');
    try { await fs.access(conf); } catch {
      await fs.writeFile(conf, 'server { backupInterval = 1, backupTTL = 14, backupTime = "18:00" }\n');
    }
    const enforced = {
      ip: '127.0.0.1', port: this.port, initialOpenInBrowserEnabled: false,
      systemTrayEnabled: false, webUIFlavor: 'CUSTOM', webUIUpdateCheckInterval: 0,
      webUIEnabled: true, downloadsPath: settings.downloadsPath, authMode: 'NONE',
    };
    const tempDir = path.join(this.stateDir, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const args = [
      `-Djava.io.tmpdir=${tempDir}`,
      '-Xmx1024m', `-Dsuwayomi.tachidesk.config.server.rootDir=${this.stateDir}`,
      ...Object.entries(enforced).map(([key, value]) => `-Dsuwayomi.tachidesk.config.server.${key}=${JSON.stringify(value)}`),
      '-cp', `${this.wrapper}${path.delimiter}${path.join(this.runtime, 'bin', 'Suwayomi-Server.jar')}`, 'BihonServer',
    ];
    const log = createWriteStream(path.join(this.stateDir, 'desktop-server.log'), { flags: 'w' });
    this.child = spawn(path.join(this.runtime, 'jre', 'bin', 'java.exe'), args, { cwd: this.runtime, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const child = this.child;
    child.stdout.pipe(log); child.stderr.pipe(log);
    let failure;
    child.on('error', error => { failure = error; });
    child.on('exit', (code) => { this.child = null; log.end(); failure = new Error(`Local server exited (${code}). See desktop-server.log.`); });
    await writeJson(path.join(this.stateDir, 'desktop-server.json'), { pid: child.pid, port: this.port });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      try {
        const response = await fetch(`${this.url}/api/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }), signal: AbortSignal.timeout(1500) });
        const data = await response.json();
        if (data.data?.__typename) {
          const uiResponse = await fetch(this.url, { signal: AbortSignal.timeout(2000) });
          const html = await uiResponse.text();
          if (uiResponse.ok && html.includes('id="root"') && html.includes('<script')) return this.url;
        }
      } catch { /* Booting. */ }
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    await this.stop(); throw new Error('Local server did not start within two minutes. See desktop-server.log.');
  }
  async pause() {
    if (!this.child) return;
    const response = await fetch(`${this.url}/api/v1/downloads/stop`, { signal: AbortSignal.timeout(35000) });
    if (!response.ok) throw new Error(`Could not pause downloads (${response.status}).`);
  }
  async stop() {
    const child = this.child;
    if (!child) return;
    const exited = once(child, 'exit');
    child.stdin.end('shutdown\n');
    let timer;
    try {
      await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Server is still closing. Originals have not been moved.')), 30000); })]);
    } finally { clearTimeout(timer); }
  }
}
module.exports = { Server, freePort };
