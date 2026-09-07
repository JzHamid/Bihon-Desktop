const { _electron: electron } = require('playwright');
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
const {freePort}=require('../desktop/server.cjs');const {readJson,writeJson}=require('../desktop/storage.cjs');
const root=path.resolve(__dirname,'..');
async function run(){
 const stateDir=path.join(root,'.test-data','first-run-020-'+Date.now());await fs.mkdir(stateDir,{recursive:true});
 await fs.writeFile(path.join(stateDir,'server.conf'),'server.socksProxyEnabled=true\nserver.socksProxyHost="127.0.0.1"\nserver.socksProxyPort="9"\n');
 await writeJson(path.join(stateDir,'desktop-settings.json'),{downloadsPath:path.join(stateDir,'downloads'),port:await freePort()});
 const env={...process.env,BIHON_DATA_DIR:stateDir};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.BIHON_EXECUTABLE||require('electron'),args:process.env.BIHON_EXECUTABLE?[]:[root],env,timeout:60000});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForURL('http://127.0.0.1:*/**',{timeout:180000});const base=new URL(page.url()).origin;
  await page.goto(base+'/browse?tab=extensions');
  await page.getByText('Preparing your extension list',{exact:true}).waitFor({timeout:30000});
  assert.equal((await page.evaluate(()=>window.bihon.setupInfo())).defaultRepositoryReady,false);
  console.log('PASS offline first launch opens app and explains automatic setup without asking for a repository URL');
  const response=await fetch(base+'/api/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'mutation { setSettings(input: {settings: {socksProxyEnabled: false}}) { settings { socksProxyEnabled } } }'})});
  const changed=await response.json();assert.equal(changed.errors,undefined,JSON.stringify(changed.errors));
  const deadline=Date.now()+150000;
  while(!(await readJson(path.join(stateDir,'default-repository.json'),null))?.configured){if(Date.now()>deadline)throw Error('Automatic online retry did not finish');await new Promise(r=>setTimeout(r,1000))}
  await page.getByText('Preparing your extension list',{exact:true}).waitFor({state:'hidden',timeout:30000});
  await page.getByRole('button',{name:'Install',exact:true}).first().waitFor({timeout:60000});
  assert.equal((await readJson(path.join(stateDir,'upgrade-state.json'))).lastUpgradeBackup,null);
  assert.deepEqual(errors,[]);
  console.log('PASS reconnect automatically adds repository and refreshes installable extensions without restarting; fresh install needs no upgrade snapshot');
  await writeJson(path.join(root,'artifacts/first-run-020-result.json'),{stateDir,passed:true});
 }catch(e){console.error(e);for(const page of await app.windows())console.log((await page.locator('body').innerText().catch(()=>'' )).slice(0,1400));throw e}
 finally{await app.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
