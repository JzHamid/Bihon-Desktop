const fs=require('node:fs/promises');const path=require('node:path');const {spawn}=require('node:child_process');const {once}=require('node:events');
const root=path.resolve(__dirname,'..');
async function run(){
 const stateDir=path.join(root,'.test-data/engine');const conf=path.join(stateDir,'server.conf');const original=await fs.readFile(conf,'utf8');
 const desktopSettings=path.join(stateDir,'desktop-settings.json');
 const settings=JSON.parse(await fs.readFile(desktopSettings,'utf8').catch(()=> '{}'));
 await fs.writeFile(desktopSettings,JSON.stringify({...settings,downloadsPath:path.join(root,'.test-data/engine-downloads')}));
 const cache=path.join(stateDir,'temp/manga-cache');
 try{await fs.rename(cache,cache+'-before-offline-'+Date.now())}catch(e){if(e.code!=='ENOENT')throw e}
 try{
  await fs.writeFile(conf,original+'\nserver.socksProxyEnabled=true\nserver.socksProxyHost="127.0.0.1"\nserver.socksProxyPort="9"\n');
  const child=spawn(process.execPath,[path.join(root,'scripts/verify-reader.cjs')],{cwd:root,env:{...process.env,BIHON_READER_FIXTURE:'engine-reader.json'},stdio:'inherit',windowsHide:true});
  const [code]=await once(child,'exit');if(code!==0)throw Error('Offline reader failed');
  console.log('PASS downloaded 14-page chapter rendered with cleared page cache and unavailable outbound SOCKS proxy');
 }finally{await fs.writeFile(conf,original)}
}
run().catch(e=>{console.error(e);process.exitCode=1});
