const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { Server } = require('../desktop/server.cjs');
const root = path.resolve(__dirname, '..');
const stateDir = path.join(root, '.test-data/library');
const settings = { downloadsPath: path.join(root, '.test-data/library-downloads') };
const server = new Server({ stateDir, runtime: path.join(root, 'runtime/Suwayomi-Server-v2.3.2243-windows-x64'), ui: path.join(root, 'vendor/webui/build'), wrapper: path.join(root, 'desktop/java') });
async function request(route, options = {}) {
  const r = await fetch(server.url + '/api/v1/' + route, { ...options, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw Error(`${route}: ${r.status} ${(await r.text()).slice(0,200)}`);
  return r;
}
async function json(route, options) { const t=await (await request(route,options)).text(); try{return JSON.parse(t)}catch{return t} }
const form = body => ({ method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
async function run() {
  const chapterDir = path.join(stateDir, 'local/Bihon test comic/Chapter 1');
  await fs.mkdir(chapterDir,{recursive:true});
  const original = require('./test-page.cjs').makePage();
  await fs.writeFile(path.join(chapterDir,'01.png'),original);
  await fs.writeFile(path.join(chapterDir,'02.png'),original);
  await server.start(settings);
  console.log('Local fixture engine ready:',server.url);
  const popular=await json('source/0/popular/1');
  const manga=popular.mangaList.find(m=>m.title==='Bihon test comic');
  assert.ok(manga,'Local comic found');
  await json(`manga/${manga.id}/library`);
  let categories=await json('category');
  if(!categories.some(c=>c.name==='Bihon test')) await json('category',form('name=Bihon%20test'));
  categories=await json('category');
  const category=categories.find(c=>c.name==='Bihon test');
  await json(`manga/${manga.id}/category/${category.id}`);
  const chapters=await json(`manga/${manga.id}/chapters?onlineFetch=true`);
  const route=`manga/${manga.id}/chapter/${chapters[0].index}`;
  assert.equal((await json(route)).pageCount,2);
  for(let i=0;i<2;i++) assert.deepEqual(Buffer.from(await (await request(`${route}/page/${i}`)).arrayBuffer()),original);
  await json(route,{...form('read=true&lastPageRead=1'),method:'PATCH'});
  const backup=Buffer.from(await (await request('backup/export')).arrayBuffer());
  assert.ok(backup.length>20);
  await fs.mkdir(path.join(root,'artifacts'),{recursive:true});
  await fs.writeFile(path.join(root,'artifacts/library-test.proto.gz'),backup);
  console.log('Backup validation:',JSON.stringify(await json('backup/validate',{method:'POST',body:backup})));
  await server.stop();
  await server.start(settings);
  assert.equal((await json(`manga/${manga.id}`)).inLibrary,true);
  assert.ok((await json(`manga/${manga.id}/category`)).some(c=>c.id===category.id));
  const persisted=await json(route);assert.equal(persisted.read,true);assert.equal(persisted.lastPageRead,1);
  assert.deepEqual(Buffer.from(await (await request(`${route}/page/1`)).arrayBuffer()),original);
  console.log('PASS local pages, library, categories, reading progress survive restart');
  await json(`manga/${manga.id}/library`,{method:'DELETE'});
  assert.equal((await json(`manga/${manga.id}`)).inLibrary,false);
  console.log('Backup restore:',JSON.stringify(await json('backup/import',{method:'POST',body:backup})));
  assert.equal((await json(`manga/${manga.id}`)).inLibrary,true);
  console.log('PASS protobuf backup restored removed library entry');
  await fs.writeFile(path.join(root,'artifacts/local-reader.json'),JSON.stringify({stateDir,mangaId:manga.id,chapterIndex:chapters[0].index}));
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.stop());
