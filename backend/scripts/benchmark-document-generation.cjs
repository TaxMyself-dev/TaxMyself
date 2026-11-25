/* Synthetic timing harness: actual before/after orchestration and Chromium.
 * DB/storage/email are isolated simulations; --live=diagnostic|remaining permits
 * at most 24 actual FillFaster calls across both phases in the fixed evidence dir.
 * Never boot Nest, connect to a DB, contact SHAAM, upload files or send email.
 */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '..');
const out = path.join(root, '.test-tmp/document-speed-2026-11-25');
fs.mkdirSync(out, {recursive: true});
const livePhase = process.argv.find(x => x.startsWith('--live='))?.split('=')[1];
assert(!livePhase || ['diagnostic', 'remaining'].includes(livePhase), 'Invalid phase');
const beforeRevision = 'c46490a71dca24ca07250b1ae9233047b72b4a41';
const harnessSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const afterRevision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim();
const print = x => process.stdout.write(JSON.stringify(x) + '\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
delete process.env.PDF_SERVICE_URL;
delete process.env.K_SERVICE;
delete process.env.PDF_PARALLEL_SIGNING;
delete process.env.DOCUMENT_EMAIL_QUEUE_ENABLED;
delete process.env.PDF_DIAGNOSTICS_FILE;
process.env.NODE_ENV='test';
// Fail closed even if any accidentally unmocked application path attempts storage.
const realLoad=Module._load;
let logoBuffer;
const metrics={};
const bump = name => { metrics[name]=(metrics[name]||0)+1; };
const assetPath='identity-images/business/1/11111111-1111-4111-8111-111111111111.png';
const fakeFirebase={storage:()=>({bucket:()=>({file:filePath=>{
  assert.equal(filePath, assetPath, 'Only the synthetic logo may reach the fake storage');
  return {getMetadata:async()=>{bump('logoMetadata'); return [{size:logoBuffer.length}];},
    download:async()=>{bump('logoDownload'); await sleep(120); return [Buffer.from(logoBuffer)];}};
}})})};
Module._load=function(request,...args){if(request==='firebase-admin') return fakeFirebase; return realLoad.call(this,request,...args);};
require('tsconfig-paths').register({baseUrl:path.join(backend,'dist'),paths:{'src/*':['*']}});
const orm=require('typeorm');
orm.DataSource.prototype.initialize=async()=>{throw Error('LIVE_DATABASE_FORBIDDEN');};
orm.DataSource.prototype.query=async()=>{throw Error('LIVE_DATABASE_FORBIDDEN');};
function historicalClass(relative, exported){
  const source=execFileSync('git',['show',`${beforeRevision}:${relative}`],{cwd:root,encoding:'utf8'});
  const filename=path.join(backend,'dist',relative.replace('backend/src/','').replace(/\.ts$/,'.js'));
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2017,
    module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText;
  const mod=new Module(filename,module); mod.filename=filename; mod.paths=Module._nodeModulePaths(path.dirname(filename));
  mod._compile(compiled,filename); return mod.exports[exported];
}
const BeforeDocuments=historicalClass('backend/src/documents/documents.service.ts','DocumentsService');
const BeforeImages=historicalClass('backend/src/identity-images/image-storage.service.ts','ImageStorageService');
const {DocumentsService:AfterDocuments}=require('../dist/documents/documents.service');
const {ImageStorageService:AfterImages}=require('../dist/identity-images/image-storage.service');
const {DocumentPdfRenderer}=require('../dist/documents/pdf/document-pdf-renderer.service');
const {FillFasterSigner}=require('../dist/documents/pdf/fillfaster-signer.service');
const {DocumentType:DT,DocumentStatusType:DS,BusinessType:BT,UnitOfMeasure:UOM,VatOptions:VO}=require('../dist/enum');
const ledgerPath=path.join(out,'live-signing-requests.jsonl');
let calls=fs.existsSync(ledgerPath)?fs.readFileSync(ledgerPath,'utf8').trim().split('\n').filter(Boolean).length:0;
const realSigner=new FillFasterSigner();
if(livePhase){
  const env=require('dotenv').parse(fs.readFileSync(path.join(backend,'.env')));
  assert(env.FILLFASTER_API_TOKEN,'Development signing token missing');
  process.env.FILLFASTER_API_TOKEN=env.FILLFASTER_API_TOKEN;
}
// Existing verbose application logs are suppressed, not persisted.
console.log=()=>{}; console.error=()=>{}; console.warn=()=>{};
let phase='setup';
let activeScenario;
let stopRequested=false;
process.once('SIGINT',()=>{stopRequested=true;});
function input(scenario){
  const count=scenario.rows||3, net=count*100;
  return {docData:{docType:scenario.type||DT.TAX_INVOICE,docNumber:'00000',generalDocIndex:'0000000',
    issuerBusinessNumber:'SYNTHETIC_ONLY',issuerName:'עסק בדיקה סינתטי בלבד',businessType:BT.LICENSED,
    recipientName:'לקוח בדיקה בלבד',recipientEmail:'synthetic@example.invalid',sendEmailToRecipient:!!scenario.email,
    docDate:'2026-11-25',docDescription:'בדיקת ביצועים בלבד — אינו מסמך חשבונאי',
    sumBefDisBefVat:net,disSum:0,sumAftDisBefVAT:net,vatSum:net*.18,sumAftDisWithVAT:net*1.18,
    withholdingTaxAmount:0,allocationNum:scenario.allocated?'123456789':null,
    docStatus:scenario.finalize?DS.PENDING_ALLOCATION:DS.OPEN,journalEntryId:scenario.finalize?81:null},
    linesData:Array.from({length:count},(_,i)=>({description:`פריט בדיקה ${i+1} — עברית ו-English`,
      unitQuantity:1,sumBefVatPerUnit:100,disBefVatPerLine:0,sumAftDisBefVatPerLine:100,vatOpts:VO.INCLUDE,
      unitType:UOM?.UNIT})),paymentData:scenario.payments?[{paymentMethod:'BANK_TRANSFER',paymentAmount:net*1.18,paymentDate:'2026-11-25',bankNumber:'00',hebrewBankName:'בנק בדיקה',branchNumber:'000',accountNumber:'000'}]:[]};
}
function reset(){for(const key of Object.keys(metrics)) delete metrics[key];}
function setup(variant, scenario){
  const Service=variant==='before'?BeforeDocuments:AfterDocuments;
  const service=Object.create(Service.prototype);
  service.logger={warn:()=>{},error:()=>{},log:()=>{}};
  const images=new (variant==='before'?BeforeImages:AfterImages)();
  service.imageStorage=images;
  service.documentPdfRenderer=new DocumentPdfRenderer();
  const state={uploaded:[],models:[],pdfs:[],events:[],dbDocument:null};
  const business={businessName:'עסק בדיקה סינתטי בלבד',businessType:BT.LICENSED,
    businessAddress:'כתובת סינתטית',businessPhone:'',businessEmail:'synthetic@example.invalid',
    logoPath:scenario.logo?assetPath:null};
  service.businessService={getBusinessByNumber:async()=>{bump('businessLookup'); await sleep(5);return business;}};
  service.sharedService={normalizeToMySqlDate:x=>x,buildReportPeriodLabel:()=> '2026-11'};
  const repo={save:async row=>{await sleep(5);return row;},update:async()=>{await sleep(5);}};
  const manager={getRepository:()=>repo,query:async()=>{throw Error('UNEXPECTED_SQL');}};
  const runner={manager,connect:async()=>{},startTransaction:async()=>{state.events.push('begin');},
    commitTransaction:async()=>{bump('commit');state.events.push('commit');},
    rollbackTransaction:async()=>{bump('rollback');state.events.push('rollback');},release:async()=>{}};
  service.dataSource={createQueryRunner:()=>runner};
  service.incrementGeneralIndex=async()=>({currentIndex:100});
  service.incrementCurrentIndex=async()=>({currentIndex:21});
  service.deleteDraft=async()=>{};
  service.saveDocInfo=async(_user,doc)=>{state.dbDocument={...doc,id:99};return state.dbDocument;};
  service.saveLinesInfo=service.savePaymentsInfo=async()=>{};
  service.bookkeepingService={createJournalEntry:async()=>{bump('journal');return {id:81,entryNumber:81};}};
  service.userRepo={findOne:async()=>null};
  service.fillFasterSigner={sign:async pdf=>{
    bump('signCalls');
    metrics.maxSigns=Math.max(metrics.maxSigns||0,(metrics.activeSigns||0)+1);
    metrics.activeSigns=(metrics.activeSigns||0)+1;
    const started=performance.now();
    try{
      if(scenario.failSign) throw Object.assign(Error('SYNTHETIC_SIGN_FAILURE'),{status:429});
      if(livePhase){
        assert(calls<24,'APPROVED_SIGNING_BUDGET_EXHAUSTED');
        calls++;
        fs.appendFileSync(ledgerPath,JSON.stringify({call:calls,scenario:scenario.name,variant,startedAt:new Date().toISOString()})+'\n');
        return await realSigner.sign(pdf);
      }
      await sleep(500); return pdf;
    }finally{metrics.activeSigns--;metrics.signSumMs=(metrics.signSumMs||0)+performance.now()-started;}
  }};
  const render=service.documentPdfRenderer.render.bind(service.documentPdfRenderer);
  service.documentPdfRenderer.render=async model=>{
    bump('renders');state.models.push(model);
    if(scenario.failAsset) model={...model,logoDataUri:'data:image/png;base64,bm90LWFuLWltYWdl'};
    const started=performance.now(); const pdf=await render(model);metrics.renderSumMs=(metrics.renderSumMs||0)+performance.now()-started;assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
    state.pdfs.push(pdf);return pdf;
  };
  service.uploadToFirebase=async(pdf,...args)=>{
    const role=args[4];bump('uploads'); await sleep(100);
    if(scenario.failUpload && role==='copy') throw Error('SYNTHETIC_UPLOAD_FAILURE');
    const file=`synthetic/${scenario.name}/${role}.pdf`;state.uploaded.push({file,pdf});return file;
  };
  service.deleteFromFirebase=async()=>{bump('cleanup');};
  service.downloadFromFirebase=async()=>{bump('pdfRedownload');await sleep(100);return state.uploaded[0].pdf;};
  service.mailService={sendMailWithAttachment:async()=>{bump('mail');await sleep(500);}};
  service.documentEmailQueue={enabled:()=>!!scenario.queue,
    enqueue:async(tx)=>{assert.equal(tx,manager);bump('enqueue');state.events.push('enqueue');await sleep(5);return 7;},
    kick:()=>{assert(state.events.includes('commit'),'Dispatch before commit');bump('kick');}};
  const fixture=input(scenario);
  service.documentsRepo={findOne:async()=>({...fixture.docData,id:99}),save:repo.save};
  service.docLinesRepo={find:async()=>fixture.linesData};
  service.docPaymentsRepo={find:async()=>fixture.paymentData};
  service.shaamAllocationAttemptRepo={findOne:async()=>scenario.unresolved?{state:'UNKNOWN_OUTCOME'}:null};
  return {service,state,fixture};
}
async function run(context,scenario){
  context.state.models=[];context.state.pdfs=[];context.state.uploaded=[];context.state.events=[];
  if(scenario.preview) return context.service.previewDoc(input(scenario));
  if(scenario.finalize||scenario.unresolved) return context.service.finalizeAllocation('synthetic-owner',{
    issuerBusinessNumber:'SYNTHETIC_ONLY',docType:scenario.type||DT.TAX_INVOICE,docNumber:'00000',allocationNum:scenario.allocated?'123456789':null});
  return context.service.createDoc(input(scenario),'synthetic-owner');
}
const localCases=[
  {name:'receipt-no-allocation',type:DT.RECEIPT},
  {name:'invoice-no-allocation'},
  {name:'allocation-finalization',allocated:true,finalize:true},
  {name:'allocation-with-logo',allocated:true,finalize:true,logo:true},
  {name:'multipage-allocation-logo',allocated:true,finalize:true,logo:true,rows:70},
  {name:'receipt-email-compatible',type:DT.RECEIPT,logo:true,email:true},
  {name:'receipt-email-queued',type:DT.RECEIPT,logo:true,email:true,queue:true},
  {name:'warm-logo-preview',logo:true,preview:true,warm:true},
  {name:'cold-browser-receipt',type:DT.RECEIPT,cold:true},
  {name:'tax-invoice-receipt-payment',type:DT.TAX_INVOICE_RECEIPT,logo:true,payments:true},
];
const liveCases=[localCases[0],localCases[2],localCases[4]];
const failures=[{name:'sign-quota-failure',failSign:true},{name:'partial-upload-failure',failUpload:true},
  {name:'invalid-image',failAsset:true},{name:'unresolved-allocation',unresolved:true}];
function median(values){const a=[...values].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;}
async function main(){
  logoBuffer=await require('sharp')({create:{width:180,height:100,channels:4,background:'#8b9f77'}}).png().toBuffer();
  let jobs;
  if(livePhase==='diagnostic'){
    assert.equal(calls,0,'Diagnostic already attempted; do not repeat paid calls');
    jobs=[{scenario:liveCases[0],repeat:0}];
  }else if(livePhase==='remaining'){
    const diagnostic=JSON.parse(fs.readFileSync(path.join(out,'live-diagnostic.json'),'utf8'));
    assert.equal(diagnostic.status,'passed','Review diagnostic failure before further calls');
    assert.equal(calls,4,'Unexpected existing call count; no automatic live replay');
    jobs=[{scenario:liveCases[0],repeat:1},...liveCases.slice(1).flatMap(scenario=>[0,1].map(repeat=>({scenario,repeat})))];
  }else jobs=localCases.flatMap(scenario=>[0,1,2].map(repeat=>({scenario,repeat})));
  const contexts=new Map(), rows=[];
  try{
    for(const {scenario,repeat} of jobs){
      if(stopRequested) throw Error('BENCHMARK_INTERRUPTED');
      activeScenario=scenario.name;
      for(const variant of repeat%2?['after','before']:['before','after']){
        phase=`${scenario.name}/${repeat}/${variant}`;
        const key=`${scenario.name}/${variant}`;
        if(!contexts.has(key)){
          const ctx=setup(variant,scenario);contexts.set(key,ctx);
          // Untimed unsigned warm-up; no paid signing/DB/storage/mail involved.
          if(!scenario.cold){
            const model=await ctx.service.preparePdfModel(input(scenario),true,false);
            await ctx.service.documentPdfRenderer.render(model);
          }
          if(!scenario.warm){ctx.service.imageStorage=new (variant==='before'?BeforeImages:AfterImages)();}
        }
        const ctx=contexts.get(key);
        if(scenario.cold&&repeat){await ctx.service.documentPdfRenderer.onModuleDestroy();ctx.service.documentPdfRenderer=new DocumentPdfRenderer();
          const raw=ctx.service.documentPdfRenderer.render.bind(ctx.service.documentPdfRenderer);
          ctx.service.documentPdfRenderer.render=async model=>{bump('renders');ctx.state.models.push(model);const pdf=await raw(model);ctx.state.pdfs.push(pdf);return pdf;};}
        reset();
        const start=performance.now(); await run(ctx,scenario); const totalMs=performance.now()-start;
        assert.equal(metrics.rollback||0,0,'Successful scenario rolled back');
        if(!scenario.preview){assert.equal(metrics.commit,1);assert.equal(metrics.signCalls,2);assert.equal(ctx.state.pdfs.length,2);
          assert.equal(ctx.state.models[0].documentType,'מקור');assert.equal(ctx.state.models[1].documentType,'העתק נאמן למקור');}
        for(const model of ctx.state.models) assert.equal(model.allocation||null,scenario.allocated?'מספר הקצאה: 123456789':null);
        const row={scenario:scenario.name,repeat,variant,totalMs:Math.round(totalMs),metrics:{...metrics},pdfBytes:ctx.state.pdfs.map(p=>p.length)};
        rows.push(row);print(row);
        if(!livePhase) fs.writeFileSync(path.join(out,'local-progress.json'),JSON.stringify({status:'running',beforeRevision,afterRevision,harnessSha256,rows},null,2));
        if(livePhase||repeat===0) for(let i=0;i<ctx.state.uploaded.length;i++){
          fs.writeFileSync(path.join(out,`${livePhase||'local'}-${scenario.name}-${repeat}-${variant}-${i}.pdf`),ctx.state.uploaded[i].pdf);
        }
      }
      // Do not retain one browser per scenario: keep the resource window fixed
      // at two comparison browsers instead of accumulating idle Chromium trees.
      if(!livePhase && repeat===2){
        for(const variant of ['before','after']){
          const key=`${scenario.name}/${variant}`;
          await contexts.get(key).service.documentPdfRenderer.onModuleDestroy();
          contexts.delete(key);
        }
      }
    }
    const checks=[];
    if(!livePhase){
      for(const scenario of failures)for(const variant of ['before','after']){
        activeScenario=scenario.name;phase=`failure/${scenario.name}/${variant}`;const ctx=setup(variant,scenario);reset();
        let failed=false;try{await run(ctx,scenario);}catch{failed=true;}
        assert(failed,'Failure scenario unexpectedly succeeded');assert.equal(metrics.commit||0,0);
        assert.equal(metrics.mail||0,0);assert.equal(metrics.kick||0,0);
        if(scenario.unresolved)assert.equal(metrics.renders||0,0);
        if(scenario.failUpload)assert((metrics.cleanup||0)>=1);
        if(scenario.failAsset)assert.equal(metrics.signCalls||0,0);
        checks.push({scenario:scenario.name,variant,status:'passed',metrics:{...metrics}});
        await ctx.service.documentPdfRenderer.onModuleDestroy();
      }
    }
    const report={status:'passed',beforeRevision,afterRevision,harnessSha256,livePhase:livePhase||null,liveCallsTotal:calls,
      environment:{node:process.version,platform:process.platform,renderer:'real local Chromium',
        signer:livePhase?'real FillFaster':'simulated 500ms (controlled assumption; not live)',database:'isolated simulation',
        logo:'synthetic storage 120ms + real sharp; before uncached / after real cache',
        upload:'isolated 100ms each',mail:'isolated 500ms; queued-after uses transaction/kick spy',
        shaam:'not contacted; existing synthetic allocation number'},rows,failureChecks:checks};
    const file=path.join(out,livePhase?`live-${livePhase}.json`:'local.json');
    fs.writeFileSync(file,JSON.stringify(report,null,2));print({event:'complete',file,liveCalls:calls,rows:rows.length,checks:checks.length});
  }finally{
    for(const ctx of contexts.values())await ctx.service.documentPdfRenderer.onModuleDestroy();
  }
}
main().catch(error=>{const status=error?.response?.status;const fail={status:'failed',phase,scenario:activeScenario,
  errorName:error?.name,errorCode:error?.code,httpStatus:status,liveCalls:calls};
  fs.writeFileSync(path.join(out,`failure-${livePhase||'local'}.json`),JSON.stringify(fail,null,2));
  print(fail);process.exitCode=1;});
