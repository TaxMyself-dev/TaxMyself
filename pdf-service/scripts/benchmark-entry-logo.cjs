// Local real Chromium only. No signing, DB, storage or email requests.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),backend=path.join(root,'backend'),out=path.join(root,'.test-tmp/entry-logo');
const sharp=require(path.join(backend,'node_modules/sharp')),ts=require(path.join(backend,'node_modules/typescript'));
const baseline='5db0e1cd057400759728da54c7e796f87c08f2e4';
const filename=path.join(backend,'dist/identity-images/image-storage.service.js'),entry=new Module(filename,module);entry.filename=filename;entry.paths=Module._nodeModulePaths(path.dirname(filename));
entry._compile(ts.transpileModule(execFileSync('git',['show',baseline+':backend/src/identity-images/image-storage.service.ts'],{cwd:root,encoding:'utf8'}),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,filename);
const Before=entry.exports.ImageStorageService,After=require(filename).ImageStorageService;
const {createRenderer}=require('../src/renderer.cjs');
const stages=[],renderer=()=>createRenderer({puppeteer:require('puppeteer-core'),template:require('../dist/document-pdf.template.js'),executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',fontDirectory:path.join(backend,'src/assets/document-fonts'),diagnostics:true,logger:line=>{const event=JSON.parse(line);if(event.event==='pdf_render_stages')stages.push(event);}});
function model(logo,rows=3,kind='original'){
 return {title:'בדיקת PDF 20000',issuerName:'עסק סינתטי',recipientName:'לקוח בדיקה',date:'26-11-2026',documentType:kind==='original'?'מקור':'העתק נאמן למקור',preview:false,allocation:rows===55?'מספר הקצאה לבדיקה: 123456789':'',items:Array.from({length:rows},(_,i)=>({'פירוט':'שורת בדיקה '+i,'כמות':'1.00','מחיר':'₪10.00','הנחה':'₪0.00','סה"כ':'₪10.00'})),totals:[{'סה"כ':'₪'+rows*10+'.00'}],payments:[],paymentTotals:[],...(logo?{logoDataUri:`data:image/${logo[0]===255?'jpeg':'png'};base64,${logo.toString('base64')}`}:{})};
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const source=fs.readFileSync(path.join(out,'source-logo.png'));
 const logos={before:await new Before().normalize(source,'business',true),after:await new After().normalize(source,'business',true)};
 for(const [key,bytes] of Object.entries(logos))fs.writeFileSync(path.join(out,key+(bytes[0]===255?'.jpg':'.png')),bytes);
 const runs=[],startup=[];
 // Each cold/warmed comparison uses a fresh browser; warmup time is measured separately.
 for(let repetition=1;repetition<=3;repetition++)for(const preload of repetition%2?[false,true]:[true,false]){
  const render=renderer();try{let t=performance.now();if(preload)await render.warmup();const warmupMs=Math.round(performance.now()-t);
   t=performance.now();await render({version:1,requestId:randomUUID(),document:model(logos.after)});startup.push({repetition,preload,warmupMs,firstRenderMs:Math.round(performance.now()-t)});
  }finally{await render.close();}
 }
 const render=renderer();try{
  await render.warmup();
  for(let repetition=1;repetition<=3;repetition++)for(const [scenario,rows,logo] of [['no-logo',3,false],['actual-logo',3,true],['allocated-multipage',55,true]])for(const variant of repetition%2?['before','after']:['after','before']){
   const started=performance.now(),files=[];
   for(const kind of ['original','copy']){const requestId=randomUUID(),t=performance.now(),bytes=await render({version:1,requestId,document:model(logo?logos[variant]:null,rows,kind)}),name=`${scenario}-${repetition}-${variant}-${kind}.pdf`;fs.writeFileSync(path.join(out,name),bytes);files.push({name,bytes:bytes.length,renderMs:Math.round(performance.now()-t),stages:stages.find(s=>s.requestId===requestId)?.stagesMs});}
   runs.push({scenario,repetition,variant,pairMs:Math.round(performance.now()-started),files});
  }
 }finally{await render.close();}
 const rawBefore=await sharp(logos.before).raw().toBuffer(),rawAfter=await sharp(logos.after).raw().toBuffer();let squared=0;for(let i=0;i<rawBefore.length;i++)squared+=(rawBefore[i]-rawAfter[i])**2;
 const report={baseline,scope:'Real local Chromium and current image normalization; no external I/O',sourceLogoBytes:source.length,logoBytes:{before:logos.before.length,after:logos.after.length},imagePsnrDb:10*Math.log10(255**2/(squared/rawBefore.length)),startup,runs};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({logoBytes:report.logoBytes,imagePsnrDb:report.imagePsnrDb,startup}));
 for(const scenario of ['no-logo','actual-logo','allocated-multipage']){let summary={scenario};for(const variant of ['before','after']){const v=runs.filter(x=>x.scenario===scenario&&x.variant===variant);summary[variant+'MeanMs']=v.reduce((s,x)=>s+x.pairMs,0)/v.length;summary[variant+'PdfBytes']=v[0].files[0].bytes;}console.log(JSON.stringify(summary));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
