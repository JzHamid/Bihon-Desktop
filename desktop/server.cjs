const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { writeJson } = require('./storage.cjs');
const { javaInvocation, serverEnvironment } = require('./platform.cjs');

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
    const { executable, args } = javaInvocation({ runtime: this.runtime, wrapper: this.wrapper, stateDir: this.stateDir, tempDir, enforced });
    const log = createWriteStream(path.join(this.stateDir, 'desktop-server.log'), { flags: 'w' });
    let failure;
    const logClosed = new Promise(resolve => log.once('close', resolve));
    log.on('error', error => { failure ||= error; });
    // Surface access errors before starting a JVM that could outlive startup.
    await once(log, 'open');
    const endLog = () => { if (!log.writableEnded) log.end(); };
    let child;
    try {
      child = spawn(executable, args, { cwd: this.runtime, env: serverEnvironment({ runtime: this.runtime }), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      endLog(); await logClosed; throw error;
    }
    this.child = child;
    // stdout and stderr close independently. Keep the log open until both have
    // drained, including native-loader diagnostics written just before exit.
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.once('error', error => {
      failure = error;
      if (this.child === child) this.child = null;
      endLog();
    });
    child.once('exit', (code, signal) => {
      if (this.child === child) this.child = null;
      failure ||= new Error(`Local server exited (${signal || code}). See desktop-server.log.`);
    });
    this.closed = new Promise(resolve => child.once('close', () => {
      endLog();
      logClosed.then(resolve);
    }));
    // A missing/nonexecutable Java binary emits error + close, never exit. Do
    // not retain it as a running child or make stop() wait for an impossible exit.
    try { await once(child, 'spawn'); }
    catch (error) { await logClosed; throw error; }
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
    if (!this.closed) return;
    if (child) child.stdin.end('shutdown\n');
    let timer;
    try {
      await Promise.race([this.closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Server is still closing. Originals have not been moved.')), 30000); })]);
    } finally { clearTimeout(timer); }
  }
}
module.exports = { Server, freePort };
