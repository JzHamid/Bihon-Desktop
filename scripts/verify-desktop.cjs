const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
async function run() {
  const env = { ...process.env, BIHON_DATA_DIR: path.join(root, '.test-data/desktop-smoke') };
  delete env.ELECTRON_RUN_AS_NODE;
  const testDownloads = path.join(root, '.test-data/smoke downloads');
  await fs.mkdir(testDownloads, {recursive:true});
  await fs.writeFile(path.join(testDownloads,'migration-test.txt'),'Bihon desktop IPC migration fixture');
  const settingsFile = path.join(env.BIHON_DATA_DIR,'desktop-settings.json');
  await fs.mkdir(env.BIHON_DATA_DIR,{recursive:true});
  const settings = JSON.parse(await fs.readFile(settingsFile,'utf8').catch(()=> '{}'));
  await fs.writeFile(settingsFile,JSON.stringify({...settings,downloadsPath:testDownloads}));
  const app = await electron.launch({ executablePath: process.env.BIHON_EXECUTABLE || require('electron'), args: [...(process.env.BIHON_EXECUTABLE ? [] : [root]), '--disable-gpu', '--remote-debugging-port=9223'], env, timeout: 45000 });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForURL('http://127.0.0.1:*/**', { timeout: 120000 });
    await page.getByRole('link', { name: 'Library', exact: true }).waitFor({ timeout: 60000 });
    console.log('Library UI loaded:', page.url());
    try { console.log(execFileSync(path.join(root, 'node_modules/node/bin/node.exe'), [path.join(root, 'node_modules/agent-browser/bin/agent-browser.js'), '--session', 'bihon-smoke', '--cdp', '9223', 'snapshot', '-i'], { timeout: 15000, encoding: 'utf8', windowsHide: true })); }
    catch (e) { console.log('agent-browser snapshot unavailable:', e.message.slice(0,160)); }
    const base = new URL(page.url()).origin;
    await page.goto(`${base}/settings/download`);
    await page.getByRole('button', { name: 'Choose folder', exact: true }).waitFor({ timeout: 20000 });
    console.log('Native folder controls rendered');
    await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
    try { await page.screenshot({ path: path.join(root, 'artifacts/download-settings.png'), timeout: 10000 }); console.log('Screenshot saved'); }
    catch (e) { console.log('Screenshot unavailable:', e.message.split('\n')[0]); }
    const info = await page.evaluate(() => window.bihon.downloadsInfo());
    console.log('Desktop IPC:', JSON.stringify(info));
    const destination = path.join(root,'.test-data','moved downloads '+Date.now());
    await fs.mkdir(destination,{recursive:true});
    await app.evaluate(({ dialog }, destination) => { dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[destination] }); }, destination);
    await page.evaluate(() => { window.bihon.chooseDownloads().catch(console.error); });
    const deadline = Date.now()+180000;
    let saved;
    do { saved=JSON.parse(await fs.readFile(settingsFile,'utf8')); if(saved.downloadsPath===destination)break; await new Promise(r=>setTimeout(r,500)); } while(Date.now()<deadline);
    if(saved.downloadsPath!==destination || await fs.readFile(path.join(destination,'migration-test.txt'),'utf8')!=='Bihon desktop IPC migration fixture') throw Error('Desktop folder migration failed');
    console.log('PASS folder IPC paused engine, migrated files, switched settings, restarted engine');
    await page.waitForURL('http://127.0.0.1:*/library', {timeout:180000});
    await page.goto(`${base}/settings/backup`);
    await page.getByText('Create backup', { exact: false }).first().waitFor({ timeout: 15000 });
    console.log('Backup screen rendered');
    await app.evaluate(({ Menu, BrowserWindow }) => { const item = Menu.getApplicationMenu().items.find(i=>i.label==='View').submenu.items.find(i=>i.role==='togglefullscreen'); if(item.accelerator!=='F11') throw Error('F11 binding missing'); const w=BrowserWindow.getAllWindows()[0]; w.setFullScreen(!w.isFullScreen()); });
    await new Promise(resolve => setTimeout(resolve, 500));
    if (!await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())) throw Error('Fullscreen failed');
    console.log('Fullscreen and F11 menu binding verified');
    await page.keyboard.press('F11');
    if (errors.length) throw new Error(`Renderer errors: ${errors.join('; ')}`);
    console.log('No renderer exceptions');
  } finally { await app.close(); }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
