// Exercises the shipped Electron/Java/WebUI combination using generated local data.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { freePort } = require('../desktop/server.cjs');
const { readJson, writeJson, digest } = require('../desktop/storage.cjs');
const { makePage } = require('./test-page.cjs');
const { makeEpub } = require('./test-epub.cjs');

const root = path.resolve(__dirname, '..');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
};
async function until(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function verifyWebview(origin, stateDir) {
  // CEF initializes asynchronously: a working GraphQL/UI endpoint alone does
  // not prove that extensions can use the packaged native WebView libraries.
  const fixture = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><head><title>Bihon Native WebView Smoke</title></head><body style="background:#375a7f;color:white"><h1>Bihon native WebView</h1></body></html>');
  });
  let socket, ping, socketError, loaded = false, painted = false;
  try {
    fixture.listen(0, '127.0.0.1');
    await once(fixture, 'listening');
    const url = `http://127.0.0.1:${fixture.address().port}/`;
    socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/api/v1/webview`);
    socket.addEventListener('error', event => { socketError = event.error || new Error(event.message || 'Native WebView connection failed.'); });
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === 'pong') {
          clearInterval(ping);
          socket.send(JSON.stringify({ type: 'loadUrl', url, width: 320, height: 240 }));
        } else if (message.type === 'load' && message.url === url) {
          assert.equal(message.status, 200, JSON.stringify(message));
          assert.equal(message.title, 'Bihon Native WebView Smoke');
          assert.ok(!message.error, message.error);
          loaded = true;
        } else if (message.type === 'render') {
          const image = Buffer.from(message.image);
          assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
          painted = true;
        }
      } catch (error) { socketError = error; }
    });
    await until(async () => {
      if (socketError) throw socketError;
      const log = await fs.readFile(path.join(stateDir, 'desktop-server.log'), 'utf8');
      assert.doesNotMatch(log, /Failed to set up CEF|java\.lang\.UnsatisfiedLinkError/, 'Bundled native WebView failed to initialize.');
      return socket.readyState === WebSocket.OPEN;
    }, 'native WebView connection', 60000);
    const sendPing = () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); };
    ping = setInterval(sendPing, 500);
    sendPing();
    await until(async () => {
      if (socketError) throw socketError;
      assert.notEqual(socket.readyState, WebSocket.CLOSED, 'Native WebView connection closed before rendering.');
      const log = await fs.readFile(path.join(stateDir, 'desktop-server.log'), 'utf8');
      assert.doesNotMatch(log, /Failed to set up CEF|java\.lang\.UnsatisfiedLinkError/, 'Bundled native WebView failed to initialize.');
      return loaded && painted;
    }, 'native WebView loading and rendering a local page', 60000);
  } finally {
    clearInterval(ping);
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
      socket.close();
      await Promise.race([closed, delay(3000)]);
    }
    fixture.closeAllConnections();
    await new Promise(resolve => fixture.close(resolve));
  }
}

async function run() {
  assert.ok(process.env.BIHON_EXECUTABLE, 'Set BIHON_EXECUTABLE to the packaged Bihon executable.');
  const executablePath = path.resolve(process.env.BIHON_EXECUTABLE);
  assert.ok((await fs.stat(executablePath)).isFile(), 'Packaged executable does not exist.');
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bihon-packaged-'));
  const stateDir = path.join(fixtureRoot, 'state');
  const downloadsPath = path.join(fixtureRoot, 'downloads');
  const artifactDir = path.join(root, 'artifacts', `packaged-${process.platform}`);
  await fs.mkdir(artifactDir, { recursive: true });
  const errors = [], checks = [], ownedServers = new Set();
  let app, page, origin, failed;
  const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
  const request = async (route, options = {}) => {
    const response = await fetch(`${origin}/api/v1/${route}`, { ...options, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${route}: ${response.status} ${(await response.text()).slice(0, 300)}`);
    return response;
  };
  const json = async (route, options) => {
    const text = await (await request(route, options)).text();
    try { return JSON.parse(text); } catch { return text; }
  };
  const form = body => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const captureLogs = async name => {
    await fs.copyFile(path.join(stateDir, 'desktop-server.log'), path.join(artifactDir, `${name}-server.log`)).catch(() => {});
  };
  const launch = async () => {
    const env = { ...process.env, BIHON_DATA_DIR: stateDir };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = ['--disable-gpu'];
    if (process.platform === 'linux' && process.env.BIHON_SMOKE_NO_SANDBOX === '1') args.push('--no-sandbox');
    app = await electron.launch({ executablePath, args, env, timeout: 60000 });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForURL('http://127.0.0.1:*/**', { timeout: 180000 });
    origin = new URL(page.url()).origin;
    const server = await readJson(path.join(stateDir, 'desktop-server.json'));
    assert.ok(Number.isSafeInteger(server.pid) && server.pid > 0, 'Engine PID was not recorded.');
    ownedServers.add(server.pid);
    await page.getByRole('link', { name: 'Library', exact: true }).waitFor({ timeout: 60000 });
    const info = await page.evaluate(() => window.bihon.appInfo());
    assert.equal(info.stateDir, stateDir);
    assert.equal(info.downloadsPath, downloadsPath);
    console.log(`Packaged ${process.platform} Bihon ${info.version}: ${origin}`);
  };
  const close = async () => {
    if (!app) return;
    const running = app;
    let timer;
    try {
      await Promise.race([
        running.close(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Packaged app did not close gracefully.')), 45000); }),
      ]);
      app = undefined;
      await until(() => [...ownedServers].every(pid => !alive(pid)), 'bundled Java shutdown');
    } finally { clearTimeout(timer); }
  };
  try {
    await writeJson(path.join(stateDir, 'desktop-settings.json'), { downloadsPath, port: await freePort() });
    // Repository setup has dedicated unit tests. Keep this functional test offline.
    await writeJson(path.join(stateDir, 'default-repository.json'), { configured: true });
    const comicDir = path.join(stateDir, 'local', 'Bihon Smoke Comic', 'Chapter 1');
    await fs.mkdir(comicDir, { recursive: true });
    const image = makePage(320, 640);
    await fs.writeFile(path.join(comicDir, '01.png'), image);
    await fs.writeFile(path.join(comicDir, '02.png'), image);
    const epub = path.join(fixtureRoot, 'Synthetic owned book.epub');
    await fs.writeFile(epub, makeEpub());
    const originalHash = await digest(epub);

    await launch();
    pass('fresh library mounts with the bundled runtime and isolated storage');
    await verifyWebview(origin, stateDir);
    pass('bundled native WebView initializes, loads a local page, and renders PNG pixels');
    await page.goto(`${origin}/books`);
    await page.getByText('Your EPUB shelf is empty', { exact: true }).waitFor();
    await app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
    }, epub);
    await page.getByRole('button', { name: 'Import EPUBs', exact: true }).click();
    await page.getByRole('button', { name: /Bihon Smoke Book/ }).first().waitFor({ timeout: 30000 });
    const [book] = await page.evaluate(() => window.bihon.books.list());
    assert.equal(book.title, 'Bihon Smoke Book');
    assert.equal(book.metadataReady, true);
    const managed = path.join(downloadsPath, 'Books', book.fileName);
    assert.equal(await digest(managed), originalHash);
    const [duplicate] = await page.evaluate(() => window.bihon.books.import());
    assert.equal(duplicate.duplicate, true);
    assert.equal((await page.evaluate(() => window.bihon.books.list())).length, 1);
    pass('native import IPC, EPUB metadata, managed copy, and duplicate detection');

    await page.getByRole('button', { name: /Bihon Smoke Book/ }).first().click();
    await page.waitForURL(`**/books/${book.id}/read`);
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await next.waitFor({ timeout: 30000 });
    await until(() => next.isEnabled(), 'EPUB reader ready', 30000);
    await page.waitForFunction(() => Boolean(document.querySelector('foliate-view')?.lastLocation?.cfi), null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('foliate-view')?.renderer?.getContents?.().some(({ doc }) => doc.body.textContent.includes('Bihon fixture passage')), null, { timeout: 30000 });
    const location = () => page.evaluate(() => document.querySelector('foliate-view').lastLocation.cfi);
    let before = await location();
    await next.click();
    await until(async () => await location() !== before, 'Next page navigation');
    before = await location();
    await page.keyboard.press('ArrowRight');
    await until(async () => await location() !== before, 'keyboard page navigation');
    await page.getByRole('button', { name: 'Contents', exact: true }).click();
    await page.getByRole('dialog', { name: 'Contents', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Chapter 2', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await page.getByRole('dialog', { name: 'Appearance', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Scroll', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('foliate-view').renderer.getAttribute('flow') === 'scrolled');
    await page.getByRole('button', { name: 'Pages', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('foliate-view').goToFraction(0.4));
    await page.waitForFunction(() => document.querySelector('foliate-view')?.lastLocation?.fraction > 0.3);
    await until(async () => {
      const saved = await readJson(path.join(stateDir, 'books.json'));
      return saved.books[0].progress.fraction > 0.3 && !!saved.books[0].progress.cfi;
    }, 'saved EPUB location');
    const savedBook = (await readJson(path.join(stateDir, 'books.json'))).books[0];
    await page.screenshot({ path: path.join(artifactDir, 'epub-reader.png') });
    pass('EPUB pages, navigation, contents, appearance, and saved reading location');

    const popular = await json('source/0/popular/1');
    const manga = popular.mangaList.find(item => item.title === 'Bihon Smoke Comic');
    assert.ok(manga, 'Generated local comic was not discovered.');
    await json(`manga/${manga.id}/library`);
    const chapters = await json(`manga/${manga.id}/chapters?onlineFetch=true`);
    const chapter = chapters[0];
    assert.ok(chapter, 'Local comic has no chapter.');
    const route = `manga/${manga.id}/chapter/${chapter.index}`;
    assert.equal((await json(route)).pageCount, 2);
    assert.deepEqual(Buffer.from(await (await request(`${route}/page/0`)).arrayBuffer()), image);
    await page.goto(`${origin}/manga/${manga.id}/chapter/${chapter.index}`);
    await page.waitForFunction(() => [...document.images].some(item => item.complete && item.naturalWidth === 320), null, { timeout: 30000 });
    await page.goto(`${origin}/library`);
    await json(route, { ...form('read=true&lastPageRead=1'), method: 'PATCH' });
    const backup = Buffer.from(await (await request('backup/export')).arrayBuffer());
    assert.ok(backup.length > 20, 'Engine exported an empty backup.');
    await json('backup/validate', { method: 'POST', body: backup });
    await json(`manga/${manga.id}/library`, { method: 'DELETE' });
    assert.equal((await json(`manga/${manga.id}`)).inLibrary, false);
    await json('backup/import', { method: 'POST', body: backup });
    await until(async () => (await json(`manga/${manga.id}`)).inLibrary === true, 'backup restoring library membership', 30000);
    await page.goto(`${origin}/settings/backup`);
    await page.getByText('Create backup', { exact: false }).first().waitFor({ timeout: 30000 });
    pass('local comic rendering, offline page bytes, library, and backup export/validate/restore');
    await captureLogs('first-run');
    await close();
    pass('application exit gracefully shuts down its bundled Java process');

    await launch();
    await verifyWebview(origin, stateDir);
    assert.equal((await json(`manga/${manga.id}`)).inLibrary, true);
    const savedChapter = await json(route);
    assert.equal(savedChapter.read, true);
    assert.equal(savedChapter.lastPageRead, 1);
    assert.deepEqual(Buffer.from(await (await request(`${route}/page/1`)).arrayBuffer()), image);
    const [restoredBook] = await page.evaluate(() => window.bihon.books.list());
    assert.equal(restoredBook.progress.cfi, savedBook.progress.cfi);
    await page.goto(`${origin}/books/${book.id}/read`);
    await page.waitForFunction(() => document.querySelector('foliate-view')?.lastLocation?.fraction > 0.3, null, { timeout: 30000 });
    assert.equal(await digest(epub), originalHash);
    assert.deepEqual(errors, [], `Renderer exceptions: ${errors.join('; ')}`);
    pass('restart preserves comic library/progress/pages and reopens EPUB reading progress');
    await captureLogs('restart');
    await close();
    pass('no renderer exceptions or surviving bundled Java process');
  } catch (error) {
    failed = error;
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(artifactDir, 'failure.png'), timeout: 10000 }).catch(() => {});
      await fs.writeFile(path.join(artifactDir, 'failure-page.txt'), await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).catch(() => {});
    }
    await captureLogs('failure');
    throw error;
  } finally {
    try { await close(); }
    catch (error) {
      if (!failed) failed = error;
      console.error(error.message);
      if (app) app.process().kill('SIGKILL');
    }
    // Kill only processes recorded by the isolated app owned by this invocation.
    const recorded = await readJson(path.join(stateDir, 'desktop-server.json'), null).catch(() => null);
    if (Number.isSafeInteger(recorded?.pid) && recorded.pid > 0) ownedServers.add(recorded.pid);
    for (const pid of ownedServers) {
      if (alive(pid)) {
        process.kill(pid, 'SIGKILL');
        failed ||= new Error('Bundled Java survived graceful app exit and required forced cleanup.');
      }
    }
    await until(() => [...ownedServers].every(pid => !alive(pid)), 'forced cleanup of the owned Java process').catch(error => {
      failed ||= error;
    });
    await fs.writeFile(path.join(artifactDir, 'result.json'), JSON.stringify({ platform: process.platform, executablePath, passed: !failed, checks, rendererErrors: errors, error: failed?.stack }, null, 2));
    await fs.rm(fixtureRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    if (failed) process.exitCode = 1;
  }
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
