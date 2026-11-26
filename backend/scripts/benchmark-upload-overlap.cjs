// Controlled orchestration timing only: no Nest app, DB, Chromium or provider I/O.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),ts=require('typescript');
const backend=path.resolve(__dirname,'..'),root=path.resolve(backend,'..');
process.env.NODE_ENV='test';delete process.env.PDF_DIAGNOSTICS_FILE;
require('tsconfig-paths').register({baseUrl:path.join(backend,'dist'),paths:{'src/*':['*']}});
const orm=require('typeorm');orm.DataSource.prototype.initialize=async()=>{throw Error('LIVE_DATABASE_FORBIDDEN');};
const file=path.join(backend,'dist/documents/documents.service.js'),entry=new Module(file,module);entry.filename=file;entry.paths=Module._nodeModulePaths(path.dirname(file));
const baseline='566daff5bd516221635ede69522103367e7869c5';
const source=execFileSync('git',['show',baseline+':backend/src/documents/documents.service.ts'],{cwd:root,encoding:'utf8'});
entry._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,file);
const Before=entry.exports.DocumentsService,After=require(file).DocumentsService;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const scenarios=[
 {name:'original-fast-copy-slow',parallel:true,originalSign:120,copySign:300,originalUpload:200,copyUpload:100},
 {name:'copy-fast-original-slow',parallel:true,originalSign:350,copySign:100,originalUpload:80,copyUpload:250},
 {name:'little-overlap-opportunity',parallel:true,originalSign:100,copySign:300,originalUpload:10,copyUpload:10},
 {name:'serial-signing-switch',parallel:false,originalSign:120,copySign:180,originalUpload:200,copyUpload:100},
];
async function run(Type,variant,scenario,repetition){
 process.env.PDF_PARALLEL_SIGNING=String(scenario.parallel);
 const service=Object.create(Type.prototype),events=[],started=performance.now();
 const event=(phase,kind)=>events.push({phase,kind,ms:Math.round(performance.now()-started)});
 service.preparePdfModel=async()=>({documentType:'original'});
 let renderIndex=0;
 service.documentPdfRenderer={render:async()=>{const kind=renderIndex++===0?'original':'copy';event('render-start',kind);await pause(20);event('render-end',kind);return Buffer.from(kind);}};
 service.fillFasterSigner={sign:async bytes=>{const kind=bytes.toString();event('sign-start',kind);await pause(scenario[kind+'Sign']);event('sign-end',kind);return Buffer.from(kind);}};
 service.uploadToFirebase=async(bytes,...args)=>{const kind=args[4];assert.equal(bytes.toString(),kind);event('upload-start',kind);await pause(scenario[kind+'Upload']);event('upload-end',kind);return kind+'-path';};
 service.deleteFromFirebase=async()=>{throw Error('Unexpected cleanup on successful benchmark');};
 const data={docData:{issuerBusinessNumber:'synthetic',generalDocIndex:1,docType:'PRICE_QUOTE',docDescription:'test'}};
 const pair=await service.generatePdfPair(data);
 const paths=variant==='before'?await service.uploadPdfPair(data,pair.original,pair.copy):[pair.originalFilePath,pair.copyFilePath];
 assert.deepEqual(paths,['original-path','copy-path']);assert.equal(renderIndex,2);
 return {scenario:scenario.name,variant,repetition,elapsedMs:Math.round(performance.now()-started),events};
}
(async()=>{
 const runs=[];for(const scenario of scenarios)for(let repetition=1;repetition<=3;repetition++){
  for(const variant of repetition%2?['before','after']:['after','before'])runs.push(await run(variant==='before'?Before:After,variant,scenario,repetition));
 }
 const report={baseline,scope:'Controlled render/sign/upload delays; no external I/O',runs};
 const out=path.join(root,'.test-tmp/upload-overlap/controlled.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 for(const scenario of scenarios){const avg=variant=>runs.filter(r=>r.variant===variant&&r.scenario===scenario.name).reduce((sum,r)=>sum+r.elapsedMs,0)/3;console.log(JSON.stringify({scenario:scenario.name,beforeMs:avg('before'),afterMs:avg('after')}));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
