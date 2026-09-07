const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Server, freePort } = require('./server.cjs');
const { readJson, writeJson, migrate, inside } = require('./storage.cjs');
const { configureDefaultRepository } = require('./defaults.cjs');
const { prepareUpgrade, markVersionStarted } = require('./upgrades.cjs');

const stateDir = process.env.BIHON_DATA_DIR || path.join(process.env.LOCALAPPDATA, 'Bihon');
app.setPath('userData', path.join(stateDir, 'desktop'));
app.setName('Bihon');
let window, server, settings, defaultRetry, busy = false, quitting = false;
const version = app.getVersion();
function changeZoom(action) {
  if (!window || window.isDestroyed()) return;
  const url = new URL(window.webContents.getURL());
  if (/^\/manga\/\d+\/chapter\/\d+(?:\/|$)/.test(url.pathname)) {
    window.webContents.send('bihon:reader-zoom', action);
  } else {
    const current = window.webContents.getZoomLevel();
    window.webContents.setZoomLevel(action === 'reset' ? 0 : Math.max(-3, Math.min(5, current + (action === 'in' ? 0.5 : -0.5))));
  }
}
async function setupExtensions() {
  clearTimeout(defaultRetry);
  if (quitting) return;
  if (!server?.child) { defaultRetry = setTimeout(setupExtensions, 30000); return; }
  try {
    await configureDefaultRepository({ stateDir, url: server.url });
    if (window && !window.isDestroyed()) window.webContents.send('bihon:extensions-ready');
  } catch (error) {
    console.warn('Default extension repository will retry:', error.message);
    if (!quitting) defaultRetry = setTimeout(setupExtensions, 30000);
  }
}
const settingsFile = path.join(stateDir, 'desktop-settings.json');
const root = path.resolve(__dirname, '..');
const runtime = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(root, 'runtime/Suwayomi-Server-v2.3.2243-windows-x64');
const ui = app.isPackaged ? path.join(process.resourcesPath, 'webui') : path.join(root, 'vendor/webui/build');
const wrapper = app.isPackaged ? path.join(process.resourcesPath, 'java') : path.join(__dirname, 'java');
function sendProgress(message) { if (window && !window.isDestroyed()) window.webContents.send('bihon:progress', message); }
async function saveDownloadPath(downloadsPath) { settings = { ...settings, downloadsPath }; await writeJson(settingsFile, settings); }
function trusted(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== server.url) throw new Error('Untrusted desktop request.');
}
function handle(channel, callback) { ipcMain.handle(channel, (event, ...args) => { trusted(event); return callback(...args); }); }
async function showError(error) {
  await dialog.showMessageBox(window, { type: 'error', title: 'Bihon', message: error.message, detail: `Your library and downloads remain on disk. Server log: ${path.join(stateDir, 'desktop-server.log')}` });
}
async function chooseDownloads() {
  if (busy) throw new Error('A folder operation is already running.');
  busy = true;
  try {
  const selected = await dialog.showOpenDialog(window, { title: 'Choose an empty folder for Bihon downloads', defaultPath: settings.downloadsPath, properties: ['openDirectory', 'createDirectory'] });
  if (selected.canceled) return { canceled: true };
  const destination = path.resolve(selected.filePaths[0]);
  if (destination.toLowerCase() === settings.downloadsPath.toLowerCase()) return { canceled: true };
  if (inside(stateDir, destination) || inside(destination, stateDir) || destination === stateDir) throw new Error('Choose a download folder separate from Bihon application data.');
    await server.pause();
    await server.stop();
    await migrate({ stateDir, source: settings.downloadsPath, destination, commit: saveDownloadPath, progress: sendProgress });
    await server.start(settings);
    setTimeout(() => { if (!window.isDestroyed()) window.loadURL(server.url); }, 250);
    return { canceled: false, path: settings.downloadsPath };
  } catch (error) {
    // If a journal exists, keep the server stopped so downloads cannot change
    // underneath recovery. Restarting Bihon resumes the operation first.
    const journal = await readJson(path.join(stateDir, 'download-migration.json'), null);
    if (!journal && !server.child) await server.start(settings);
    throw new Error(`${error.message}${journal ? ' Close and reopen Bihon to resume the saved migration.' : ''}`);
  } finally { busy = false; }
}
async function boot() {
  await fs.mkdir(stateDir, { recursive: true });
  settings = await readJson(settingsFile, null);
  if (!settings) {
    settings = { downloadsPath: path.join(app.getPath('downloads'), 'Bihon'), port: await freePort() };
    await writeJson(settingsFile, settings);
  }
  window = new BrowserWindow({ width: 1360, height: 900, minWidth: 900, minHeight: 600, title: 'Bihon', backgroundColor: '#11131a', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.on('zoom-changed', (_event, direction) => changeZoom(direction));
  window.once('ready-to-show', () => window.show());
  window.on('close', event => { if (busy) event.preventDefault(); });
  await window.loadFile(path.join(__dirname, 'starting.html'));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (server && new URL(url).origin === server.url) return;
    event.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Bihon', submenu: [
      { label: 'Download folder…', click: () => chooseDownloads().catch(showError) },
      { label: 'Open downloads', click: () => shell.openPath(settings.downloadsPath) },
      { label: 'Open backups', click: async () => { const dir = path.join(stateDir, 'backups'); await fs.mkdir(dir, { recursive: true }); await shell.openPath(dir); } },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { label: 'Reset zoom', accelerator: 'CmdOrCtrl+0', click: () => changeZoom('reset') }, { label: 'Zoom in', accelerator: 'CmdOrCtrl+Plus', click: () => changeZoom('in') }, { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => changeZoom('out') }, { role: 'togglefullscreen', accelerator: 'F11' }] },
    { label: 'Help', submenu: [{ label: 'Updating Bihon...', click: () => dialog.showMessageBox(window, { title: 'Update Bihon', message: 'Close Bihon and run the newer Bihon Setup installer.', detail: 'Install over the existing version. Your library, reading progress, extensions, and download folder are kept. Bihon saves a verified library backup before opening data with a newer version. You do not need to uninstall or add the extension repository again.' }) }, { label: 'Open upgrade backups', click: async () => { const dir = path.join(stateDir, 'backups/bihon-upgrades'); await fs.mkdir(dir, { recursive: true }); await shell.openPath(dir); } }, { label: 'Open application data', click: () => shell.openPath(stateDir) }, { label: 'About Bihon', click: () => dialog.showMessageBox(window, { title: 'Bihon', message: `Bihon ${version}`, detail: 'Local Windows manga reader\nPowered by Suwayomi Server 2.3.2243 and WebUI v20260726.01.\nMPL-2.0. Updates are installed manually.\nBackups contain library data; chapter downloads are separate.' }) }] },
  ]));
  server = new Server({ stateDir, runtime, ui, wrapper });
  handle('bihon:setup-info', async () => ({ defaultRepositoryReady: !!(await readJson(path.join(stateDir, 'default-repository.json'), null))?.configured }));
  handle('bihon:downloads-info', () => ({ path: settings.downloadsPath }));
  handle('bihon:choose-downloads', chooseDownloads);
  handle('bihon:open-downloads', () => shell.openPath(settings.downloadsPath));
  if (await readJson(path.join(stateDir, 'download-migration.json'), null)) {
    busy = true;
    try { await migrate({ stateDir, commit: saveDownloadPath, progress: sendProgress }); }
    finally { busy = false; }
  }
  busy = true;
  try {
    const snapshot = await prepareUpgrade({ stateDir, version });
    await server.start(settings);
    await markVersionStarted(stateDir, version, snapshot);
    await setupExtensions();
    await window.loadURL(server.url);
  } finally { busy = false; }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(boot).catch(async error => { await showError(error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    if (busy) { dialog.showMessageBox(window, { message: 'Bihon is preparing or moving your library. Please wait for the operation to finish.' }); return; }
    quitting = true;
    clearTimeout(defaultRetry);
    Promise.resolve(server?.stop()).then(() => app.quit()).catch(async error => { quitting = false; await showError(error); });
  });
}
