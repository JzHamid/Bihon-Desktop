const fs=require('fs');const path=require('path');const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const node=path.join(root,'node_modules/node/bin/node.exe');
const env={...process.env,PATH:`${path.dirname(node)};${path.join(root,'node_modules/.bin')};${process.env.PATH}`,ELECTRON_BUILDER_CACHE:path.join(root,'downloads/builder-cache'),ELECTRON_CACHE:path.join(root,'downloads/electron-cache')};
function run(executable,args){const result=spawnSync(executable,args,{cwd:root,env,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1)}
const status=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8',windowsHide:true});
if(status.status!==0||status.stdout.trim())throw Error('Commit the version and source changes before building a shareable release.');
run(node,['--test','tests/*.test.cjs']);
run(node,['scripts/build-ui.cjs']);
run(node,['vendor/webui/node_modules/typescript/bin/tsc','--noEmit','-p','vendor/webui/tsconfig.json']);
run(node,['node_modules/electron-builder/cli.js','--win','nsis','--x64']);
run(node,['scripts/source-archive.cjs']);
const version=require('../package.json').version;
for(const name of ['README.md','VERIFICATION.md','UPDATING.md','CHANGELOG.md','LICENSE','THIRD-PARTY-NOTICES.md'])fs.copyFileSync(path.join(root,name),path.join(root,'dist',name));
const crypto=require('crypto');const sums=[];
for(const name of [`Bihon Setup ${version}.exe`,`Bihon-${version}-source.zip`])sums.push(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',name))).digest('hex')+'  '+name);
fs.writeFileSync(path.join(root,'dist',`SHA256SUMS-${version}.txt`),sums.join('\n')+'\n');
console.log(`Share dist/Bihon Setup ${version}.exe together with its source archive and notices.`);
