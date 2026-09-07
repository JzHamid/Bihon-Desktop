const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { freePort } = require('../desktop/server.cjs');
const { digest, readJson, writeJson } = require('../desktop/storage.cjs');
const root = path.resolve(__dirname, '..');
async function run() {
  const fixture = await readJson(path.join(root, 'artifacts/local-reader.json'));
  const stateDir = path.join(root, '.test-data', `upgrade-020-${Date.now()}`);
  await fs.mkdir(stateDir, { recursive: true });
  for (const name of ['database.mv.db', 'server.conf', 'settings', 'extensions', 'local']) {
    await fs.cp(path.join(fixture.stateDir, name), path.join(stateDir, name), { recursive: true }).catch(e => { if(e.code !== 'ENOENT') throw e; });
  }
  const downloadsPath = path.join(stateDir, 'chosen downloads');
  await fs.mkdir(downloadsPath, { recursive: true });
  await fs.writeFile(path.join(downloadsPath, 'chapter-sentinel.txt'), 'keep downloaded files');
  await writeJson(path.join(stateDir, 'desktop-settings.json'), { downloadsPath, port: await freePort() });
  let databaseHash = await digest(path.join(stateDir, 'database.mv.db'));
  const cdp = await freePort();
  const env = { ...process.env, BIHON_DATA_DIR: stateDir }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ executablePath: process.env.BIHON_EXECUTABLE || require('electron'), args: [...(process.env.BIHON_EXECUTABLE ? [] : [root]), '--disable-gpu', `--remote-debugging-port=${cdp}`], env, timeout: 60000 });
  if (process.env.BIHON_PREVIOUS_EXECUTABLE) {
    const previous = await electron.launch({executablePath:process.env.BIHON_PREVIOUS_EXECUTABLE,args:['--disable-gpu'],env,timeout:60000});
    try {
      const oldPage=await previous.firstWindow();
      await oldPage.waitForURL('http://127.0.0.1:*/**',{timeout:180000});
      await oldPage.getByRole('link',{name:'Library',exact:true}).waitFor({timeout:30000});
      const oldBase=new URL(oldPage.url()).origin;
      await oldPage.goto(oldBase+'/manga/'+fixture.mangaId+'/chapter/'+fixture.chapterIndex);
      await oldPage.waitForFunction(()=>[...document.images].some(i=>i.naturalWidth>100),null,{timeout:30000});
      await fetch(oldBase+`/api/v1/manga/${fixture.mangaId}/chapter/${fixture.chapterIndex}`,{method:'PATCH',headers:{'content-type':'application/x-www-form-urlencoded'},body:'read=true&lastPageRead=1'});
      assert.equal(await oldPage.getByTestId('reader-zoom-surface').count(),0,'old app uses the original reader');
      console.log('Opened the same library in shipped 0.1.0 first, including its cached reader UI');
    } finally {await previous.close()}
    databaseHash = await digest(path.join(stateDir,'database.mv.db'));
  }
  let app = await launch();
  const errors = [];
  try {
    let page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await page.waitForURL('http://127.0.0.1:*/**', { timeout: 180000 });
    await page.getByRole('link', { name: 'Library', exact: true }).waitFor({ timeout: 30000 });
    const base = new URL(page.url()).origin;
    async function api(route, options) { const r=await fetch(base+route,{...options,signal:AbortSignal.timeout(30000)}); assert.ok(r.ok, `${route}: ${r.status}`); return r; }
    async function gql(query) { const r=await(await api('/api/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query})})).json();assert.equal(r.errors,undefined,JSON.stringify(r.errors));return r.data; }
    let stores;
    const setupDeadline = Date.now()+120000;
    do {
      stores = await gql('{ extensionStores { nodes { name indexUrl } } }');
      if(stores.extensionStores.nodes.some(s=>s.name==='Keiyoushi'))break;
      await new Promise(r=>setTimeout(r,1000));
    } while(Date.now()<setupDeadline);
    assert.equal(stores.extensionStores.nodes.filter(s => s.name === 'Keiyoushi').length, 1);
    const version = await readJson(path.join(stateDir, 'upgrade-state.json'));
    assert.equal(version.lastSuccessfulVersion, '0.2.0');
    assert.equal(await digest(path.join(version.lastUpgradeBackup, 'database.mv.db')), databaseHash);
    assert.equal((await readJson(path.join(stateDir, 'desktop-settings.json'))).downloadsPath, downloadsPath);
    assert.equal(await fs.readFile(path.join(downloadsPath, 'chapter-sentinel.txt'), 'utf8'), 'keep downloaded files');
    const chapterRoute = `/api/v1/manga/${fixture.mangaId}/chapter/${fixture.chapterIndex}`;
    const chapter = await(await api(chapterRoute)).json(); assert.equal(chapter.read, true); assert.equal(chapter.lastPageRead, 1);
    assert.equal((await(await api(`/api/v1/manga/${fixture.mangaId}`)).json()).inLibrary, true);
    assert.ok((await(await api(`/api/v1/manga/${fixture.mangaId}/category`)).json()).some(c => c.name === 'Bihon test'));
    console.log('PASS legacy library/progress/categories/download folder preserved; verified pre-upgrade database backup; default repository added once');
    try { console.log(execFileSync(process.execPath,[path.join(root,'node_modules/agent-browser/bin/agent-browser.js'),'--session','bihon020-'+cdp,'--cdp',String(cdp),'snapshot','-i'],{encoding:'utf8',timeout:20000,windowsHide:true}).slice(0,1200)); } catch(e) { console.log('agent-browser:',e.message.slice(0,120)); }
    for (const [key,value] of [['webUI_readingMode','0'],['webUI_readingDirection','0']]) await api(`/api/v1/manga/${fixture.mangaId}/meta`,{method:'PATCH',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({key,value})});
    await page.goto(`${base}/manga/${fixture.mangaId}/chapter/${fixture.chapterIndex}`);
    const surface=page.getByTestId('reader-zoom-surface'); await surface.waitFor({timeout:30000});
    await page.waitForFunction(()=>[...document.images].some(i=>i.naturalWidth>100),null,{timeout:30000});
    const viewport=page.getByTestId('reader-zoom-viewport');
    const rect=await viewport.boundingBox();
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    const imageWidth=()=>page.locator('img').evaluateAll(images=>Math.max(...images.filter(i=>i.naturalWidth>100).map(i=>i.getBoundingClientRect().width)));
    const originalWidth=await imageWidth();
    await page.mouse.move(x,y); await page.keyboard.down('Control'); await page.mouse.wheel(0,-120); await page.keyboard.up('Control');
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="reader-zoom-surface"]').dataset.zoom)>1.2);
    assert.ok(await imageWidth()>originalWidth*1.2, 'artwork enlarged');
    assert.equal(await app.evaluate(({ BrowserWindow })=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()),1,'UI zoom remains unchanged');
    const beforeDrag=await surface.evaluate(e=>e.style.transform);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+45,y+35,{steps:5});await page.mouse.up();
    assert.notEqual(await surface.evaluate(e=>e.style.transform),beforeDrag,'drag pans magnified page');
    await page.getByRole('button',{name:'Reset manga zoom'}).click();
    assert.equal(await surface.getAttribute('data-zoom'),'1');
    console.log('PASS Ctrl+wheel magnifies artwork, drag pans, reset restores fit without resizing UI');
    const session=await page.context().newCDPSession(page);
    await session.send('Input.synthesizePinchGesture',{x,y,scaleFactor:1.5,relativeSpeed:800,gestureSourceType:'mouse'});
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="reader-zoom-surface"]').dataset.zoom)>1.1,null,{timeout:10000});
    console.log('PASS Chromium trackpad-style pinch gesture zooms artwork');
    await page.keyboard.press('Escape');assert.equal(await surface.getAttribute('data-zoom'),'1');
    await app.evaluate(({ Menu })=>Menu.getApplicationMenu().items.find(i=>i.label==='View').submenu.items.find(i=>i.label==='Zoom in').click());
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="reader-zoom-surface"]').dataset.zoom)>1);
    await page.keyboard.press('Control+0');assert.equal(await surface.getAttribute('data-zoom'),'1');
    console.log('PASS desktop menu zoom and Ctrl+0 reset');
    await page.getByRole('button',{name:'Zoom into manga'}).click();
    await fs.mkdir(path.join(root,'artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts/zoom-020.png'),timeout:20000});
    await api(`/api/v1/manga/${fixture.mangaId}/meta`,{method:'PATCH',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({key:'webUI_readingMode',value:'4'})});
    await page.reload();await page.getByTestId('reader-zoom-surface').waitFor({timeout:30000});
    await page.getByRole('button',{name:'Zoom into manga'}).click();
    assert.ok(Number(await page.getByTestId('reader-zoom-surface').getAttribute('data-zoom'))>1);
    console.log('PASS zoom available in long webtoon mode');
    const url=stores.extensionStores.nodes.find(s=>s.name==='Keiyoushi').indexUrl;
    await gql(`mutation { removeExtensionStore(input: { indexUrl: ${JSON.stringify(url)} }) { extensionStore { name } } }`);
    await app.close(); app=await launch(); page=await app.firstWindow();
    await page.waitForURL('http://127.0.0.1:*/**',{timeout:180000});
    assert.equal((await gql('{ extensionStores { totalCount } }')).extensionStores.totalCount,0,'removed default is not silently re-added');
    assert.equal((await fs.readdir(path.join(stateDir,'backups/bihon-upgrades'))).length,1,'restart does not duplicate snapshot');
    assert.deepEqual(errors,[]);
    console.log('PASS restart respects removed default, keeps a single upgrade snapshot, no renderer exceptions');
    await writeJson(path.join(root,'artifacts/upgrade-020-result.json'),{stateDir,passed:true,version:'0.2.0'});
  } catch(e) {
    console.error('Verification failed:',e);
    for(const window of await app.windows())console.log('Window:',window.url(),(await window.locator('body').innerText().catch(()=>'' )).slice(0,1000));
    throw e;
  } finally {await app.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
