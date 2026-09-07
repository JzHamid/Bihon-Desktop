const { _electron: electron } = require('playwright');
const path=require('node:path');const fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..');
async function run(){
 const fixture=JSON.parse(await fs.readFile(path.join(root,'artifacts',process.env.BIHON_READER_FIXTURE || 'local-reader.json'),'utf8'));
 const env={...process.env,BIHON_DATA_DIR:fixture.stateDir};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.BIHON_EXECUTABLE||require('electron'),args:process.env.BIHON_EXECUTABLE?[]:[root],env,timeout:60000});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForURL('http://127.0.0.1:*/**',{timeout:180000});
  const base=new URL(page.url()).origin;
  await page.goto(`${base}/manga/${fixture.mangaId}/chapter/${fixture.chapterIndex}`);
  await page.waitForFunction(()=>[...document.images].some(i=>i.complete&&i.naturalWidth>100),null,{timeout:60000});
  console.log('Reader images loaded:',await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>i.naturalWidth>100).map(i=>({width:i.naturalWidth,height:i.naturalHeight}))));
  if(process.env.BIHON_READER_FIXTURE==='engine-reader.json'){
    const chapterRoute=base+'/api/v1/manga/'+fixture.mangaId+'/chapter/'+fixture.chapterIndex;
    const chapter=await(await fetch(chapterRoute)).json();
    if(!chapter.downloaded)throw Error('Chapter is not downloaded in this installation');
    for(let index=0;index<chapter.pageCount;index++){
      const image=await fetch(chapterRoute+'/page/'+index,{signal:AbortSignal.timeout(20000)});
      if(!image.ok || !(image.headers.get('content-type')||'').startsWith('image/'))throw Error('Offline page '+index+' failed');
      if((await image.arrayBuffer()).byteLength<100)throw Error('Empty offline page');
    }
    console.log('PASS all '+chapter.pageCount+' downloaded pages served');
  }
  await page.keyboard.press('ArrowRight');
  for (const [mode,label] of [[0,'Single page'],[4,'Webtoon']]) {
    const response=await fetch(base+'/api/v1/manga/'+fixture.mangaId+'/meta',{method:'PATCH',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({key:'webUI_readingMode',value:String(mode)})});
    if(!response.ok)throw Error('Reader mode setting failed');
    await page.reload();
    await page.waitForFunction(()=>[...document.images].some(i=>i.complete&&i.naturalWidth>100),null,{timeout:30000});
    await page.getByText(label,{exact:true}).first().waitFor({timeout:15000});
    console.log('PASS reader mode:',label);
  }
  const direction=await fetch(base+'/api/v1/manga/'+fixture.mangaId+'/meta',{method:'PATCH',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({key:'webUI_readingDirection',value:'1'})});
  if(!direction.ok)throw Error('RTL setting failed');
  await page.reload();
  await page.waitForFunction(()=>[...document.images].some(i=>i.complete&&i.naturalWidth>100),null,{timeout:30000});
  console.log('PASS reader renders with RTL setting');
  await page.mouse.wheel(0,800);

  await page.screenshot({path:path.join(root,'artifacts/reader.png'),timeout:20000});
  console.log('Reader controls:',(await page.locator('body').innerText()).slice(0,1500));
  if(errors.length)throw Error(errors.join('; '));
  console.log('PASS actual reader loads local comic without renderer exceptions');
 }finally{await app.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
