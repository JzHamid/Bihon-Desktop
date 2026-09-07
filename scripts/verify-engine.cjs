const path = require('node:path');
const fs = require('node:fs/promises');
const { Server } = require('../desktop/server.cjs');
const root = path.resolve(__dirname, '..');
const stateDir = path.join(root, '.test-data/engine');
const server = new Server({ stateDir, runtime: path.join(root, 'runtime/Suwayomi-Server-v2.3.2243-windows-x64'), ui: path.join(root, 'vendor/webui/build'), wrapper: path.join(root, 'desktop/java') });
async function api(route, options) {
  const response = await fetch(server.url + route, { ...options, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`${route}: ${response.status} ${(await response.text()).slice(0,300)}`);
  const text = await response.text(); try { return JSON.parse(text); } catch { return text; }
}
async function run() {
  console.log('Starting isolated integration engine');
  await server.start({ downloadsPath: path.join(root, '.test-data/engine-downloads') });
  console.log('Engine ready', server.url);
  const data = await api('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'mutation { addExtensionStore(input: {indexUrl: "https://raw.githubusercontent.com/keiyoushi/extensions/repo/repo.json"}) { extensionStore { name } } }' }) });
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  console.log('Extension store:', JSON.stringify(data));
  const extensions = await api('/api/v1/extension/list');
  const extension = extensions.find(e => (e.pkgName || e.pkg || '').includes('peppercarrot'));
  console.log('Selected extension:', JSON.stringify(extension));
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/extension-test-metadata.json'), JSON.stringify(extension, null, 2));
  if (!extension) throw new Error('Pepper & Carrot test extension not found');
  console.log('Install:', await api(`/api/v1/extension/install/${extension.pkgName}`));
  const sources = await api('/api/v1/source/list');
  console.log('Sources:', JSON.stringify(sources.map(s => ({ id: s.id, name: s.name }))));
  const source = sources.find(s => s.name.toLowerCase().includes('pepper'));
  if (!source) throw new Error('Installed extension did not register a source');
  console.log('Preferences:',JSON.stringify(await api('/api/v1/source/'+source.id+'/preferences')));
  const popular = await api(`/api/v1/source/${source.id}/popular/1`);
  await fs.writeFile(path.join(root, 'artifacts/source-test-result.json'), JSON.stringify(popular, null, 2));
  console.log('Popular:', JSON.stringify(popular).slice(0,900));
  const manga = popular.mangaList[0];
  await api('/api/v1/manga/' + manga.id + '/library');
  const chapters = await api('/api/v1/manga/' + manga.id + '/chapters?onlineFetch=true');
  console.log('Chapters:', JSON.stringify(chapters).slice(0,1400));
  const chapter = chapters[0];
  const route = '/api/v1/manga/' + manga.id + '/chapter/' + chapter.index;
  console.log('Online chapter:', JSON.stringify(await api(route)).slice(0,700));
  const page = await fetch(server.url + route + '/page/0');
  if (!page.ok || !(page.headers.get('content-type') || '').startsWith('image/')) throw Error('Online image failed');
  const image = Buffer.from(await page.arrayBuffer());
  console.log('Online image bytes:', image.length);
  await api('/api/v1/download/' + manga.id + '/chapter/' + chapter.index);
  await api('/api/v1/downloads/start');
  let downloaded = false;
  for (let i=0;i<60;i++) { const c=await api(route); if(c.downloaded) {downloaded=true;break;} await new Promise(r=>setTimeout(r,1000)); }
  if (!downloaded) throw Error('Download did not finish');
  await api(route, {method:'PATCH',headers:{'content-type':'application/x-www-form-urlencoded'},body:'read=true&lastPageRead=0'});
  const backupResponse = await fetch(server.url + '/api/v1/backup/export');
  if(!backupResponse.ok) throw Error('Backup export failed');
  const backup = Buffer.from(await backupResponse.arrayBuffer());
  await fs.writeFile(path.join(root,'artifacts/test-backup.proto.gz'),backup);
  console.log('Backup bytes:',backup.length);
  console.log('Backup validation:',JSON.stringify(await api('/api/v1/backup/validate',{method:'POST',body:backup})));
  await server.stop();
  await server.start({downloadsPath:path.join(root,'.test-data/engine-downloads')});
  const restored = await api(route);
  if(!restored.downloaded || !restored.read) throw Error('Download/progress did not survive restart');
  const diskPage = await fetch(server.url + route + '/page/0');
  if(!diskPage.ok || !image.equals(Buffer.from(await diskPage.arrayBuffer()))) throw Error('Downloaded page mismatch');
  console.log('Downloaded image and progress survived restart');
  await fs.writeFile(path.join(root,'artifacts/engine-reader.json'),JSON.stringify({stateDir,mangaId:manga.id,chapterIndex:chapter.index}));
  console.log('Backup import:',JSON.stringify(await api('/api/v1/backup/import',{method:'POST',body:backup})));

}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await server.stop(); });
