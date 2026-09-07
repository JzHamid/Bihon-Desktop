const fs=require('node:fs/promises');const path=require('node:path');const {Server}=require('../desktop/server.cjs');const root=path.resolve(__dirname,'..');
function fields(b){let p=0;const out=[];function int(){let n=0,shift=0,x;do{x=b[p++];n+=(x&127)*2**shift;shift+=7}while(x&128);return n}while(p<b.length){const tag=int(),wire=tag&7,id=tag>>>3;if(wire===2){const n=int();out.push([id,b.subarray(p,p+n)]);p+=n}else if(wire===0){out.push([id,int()])}else if(wire===1)p+=8;else if(wire===5)p+=4;else throw Error('Unknown protobuf wire '+wire)}return out}
const server=new Server({stateDir:path.join(root,'.test-data/engine'),runtime:path.join(root,'runtime/Suwayomi-Server-v2.3.2243-windows-x64'),ui:path.join(root,'vendor/webui/build'),wrapper:path.join(root,'desktop/java')});
async function run(){
 const response=await fetch('https://github.com/keiyoushi/extensions/raw/repo/index.pb');if(!response.ok)throw Error(response.status);
 let data=Buffer.from(await response.arrayBuffer());if(data[0]===31&&data[1]===139)data=require('node:zlib').gunzipSync(data);
 const top=fields(data);const nested=top.find(([id])=>id===101);const entries=(nested?fields(nested[1]):top).filter(([id])=>id===1);
 console.log('Public webcomic candidates:',entries.map(([,b])=>fields(b)).map(f=>f.find(([id])=>id===2)?.[1].toString()).filter(n=>/pepper|duck|comicbookplus|phd|smbc|oatmeal|gunnerkrigg/.test(n)));
 const entry=entries.map(([,b])=>fields(b)).find(f=>f.some(([id,b])=>id===2&&b.toString()==='eu.kanade.tachiyomi.extension.all.peppercarrot'));
 if(!entry)throw Error('Extension not found in catalog');
 const resources=fields(entry.find(([id])=>id===3)[1]);const url=resources.find(([id])=>id===1)[1].toString();
 if(process.env.BIHON_LIST_ONLY)return;
 console.log('APK URL:',url);const apk=await fetch(url);if(!apk.ok)throw Error('APK '+apk.status);const bytes=await apk.arrayBuffer();
 await server.start({downloadsPath:path.join(root,'.test-data/engine-downloads')});
 const form=new FormData();form.append('file',new Blob([bytes]),'tachiyomi-all.peppercarrot-v1.4.6.apk');
 const upload=await fetch(server.url+'/api/v1/extension/install',{method:'POST',body:form});console.log('APK import:',upload.status,(await upload.text()).slice(0,500));if(!upload.ok)throw Error('APK import failed');
 const list=await(await fetch(server.url+'/api/v1/extension/list')).json();if(!list.some(e=>e.pkgName==='eu.kanade.tachiyomi.extension.all.peppercarrot'&&e.installed))throw Error('Imported APK absent');console.log('PASS manual APK import registered extension');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.stop());
