// Guarded acceptance runner. No provider credentials or production endpoints used.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const {randomUUID,createHash}=require('crypto');
const backend=path.resolve(__dirname,'../..');
require(path.join(backend,'node_modules/dotenv')).config({path:path.join(backend,'.env'),override:true});
if(process.env.DB_DATABASE!=='keepintax-dev'||process.env.BILLING_TASKS_PROJECT_ID!=='keepintax-dev')throw Error('This runner only supports keepintax-dev');
const mode=process.argv[2],directory=process.argv[3];
const parent='projects/keepintax-dev/locations/europe-west1/queues/billing-completion-dev';
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2));
const metadata=x=>typeof x==='string'?JSON.parse(x):x??{};
const fields={
 billing_attempt:['status','completed_at','state_version','next_action_at','failure_category','lease_owner','lease_expires_at','receipt_doc_id','updated_at'],
 billing_obligation:['status','active_attempt_id','satisfied_attempt_id','satisfied_at','version','updatedAt'],
 billing_event:['billing_attempt_id','receipt_email_sent','metadata'],
 documents:['billing_attempt_id','file','copyFile','recipientName','recipientEmail'],
 subscription:['current_period_start','updatedAt'],
};
async function db(){
 const c=await require(path.join(backend,'node_modules/mysql2/promise')).createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:'keepintax-dev',dateStrings:true});
 const [r]=await c.query('SELECT DATABASE() db');if(r[0].db!=='keepintax-dev'){await c.end();throw Error('Actual DB mismatch');}return c;
}
async function cloud(){const {google}=require(path.join(backend,'node_modules/googleapis'));const c=await new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();assert.equal(c.quotaProjectId,'keepintax-dev');return c;}
async function api(client,resource,method='GET',data){return (await client.request({url:`https://cloudtasks.googleapis.com/v2/${resource}`,method,data,timeout:15000})).data;}
async function one(c,table,id,lock=false){const [r]=await c.query(`SELECT * FROM \`${table}\` WHERE id=?${lock?' FOR UPDATE':''}`,[id]);assert.equal(r.length,1,`Missing ${table} fixture`);return r[0];}
async function counts(c){const [r]=await c.query('SELECT (SELECT COUNT(*) FROM billing_attempt) attempts,(SELECT COUNT(*) FROM documents) documents,(SELECT COUNT(*) FROM billing_event) events');return r[0];}
function audit(dir,type,detail={}){fs.appendFileSync(path.join(dir,'audit.ndjson'),JSON.stringify({at:new Date().toISOString(),phase:read(path.join(dir,'config.json')).phase,type,...detail})+'\n');}
function logs(dir){const f=path.join(dir,'audit.ndjson');return fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];}
async function state(c,s){const a=await one(c,'billing_attempt',s.scope.attemptId),e=await one(c,'billing_event',s.scope.eventId),d=await one(c,'documents',s.scope.docId);return {a,e,d,mail:metadata(e.metadata).receiptEmail??{}};}
async function wait(label,fn,timeout=300000){const start=Date.now();let last=0;while(Date.now()-start<timeout){const v=await fn();if(v)return v;if(Date.now()-last>20000){console.log(JSON.stringify({waiting:label,seconds:Math.round((Date.now()-start)/1000)}));last=Date.now();}await new Promise(r=>setTimeout(r,1000));}throw Error(`Timed out: ${label}`);}
async function publish(client,dir,kind,id){
 const {BillingTasksService}=require(path.join(backend,'dist/billing/services/billing-tasks.service'));
 const due=new Date(),generation=`acceptance-${read(path.join(dir,'config.json')).runId}-${randomUUID()}`;
 const name=`${parent}/tasks/billing-${sha(`${kind}:${id}:${due.toISOString()}:${generation}`)}`;
 audit(dir,'TASK_PUBLISH',{name,kind,id,due:due.toISOString()});
 const tasks=new BillingTasksService({options:{database:'keepintax-dev'}});tasks.onModuleInit();assert.equal(await tasks.enqueue(kind,id,due,generation),true,'Application enqueue failed');
 return name;
}
async function initialize(){
 const c=await db(),client=await cloud();try{
  const existing=await api(client,`${parent}/tasks`);assert.equal((existing.tasks??[]).length,0,'Queue must be empty');
  const a=await one(c,'billing_attempt',2),e=await one(c,'billing_event',50),d=await one(c,'documents',19),o=await one(c,'billing_obligation',a.obligation_id),s=await one(c,'subscription',o.subscription_id);
  assert.equal(a.operation,'CHARGE');assert.equal(a.status,'COMPLETED');assert.equal(a.receipt_doc_id,d.id);assert.ok(a.cardcom_transaction_id);assert.equal(e.receipt_doc_id,d.id);assert.equal(e.event_type,'PAYMENT_SUCCESS');assert.equal(o.satisfied_attempt_id,a.id);assert.equal(o.status,'SATISFIED');assert.equal(s.status,'ACTIVE');assert.equal(e.firebase_id,s.firebase_id);assert.equal(o.firebase_id_snapshot,s.firebase_id);assert.ok(d.file&&d.copyFile);assert.ok(d.billing_attempt_id==null||d.billing_attempt_id===a.id);assert.ok(e.billing_attempt_id==null||e.billing_attempt_id===a.id);assert.equal(String(d.issuerBusinessNumber),process.env.COMPANY_BILLING_BUSINESS_NUMBER);
  const [other]=await c.query('SELECT id FROM documents WHERE billing_attempt_id=? AND id<>?',[a.id,d.id]);assert.equal(other.length,0);
  // Find exact timestamp-column spelling without changing any schema.
  for(const table of ['billing_obligation','subscription']){const [cols]=await c.query(`SHOW COLUMNS FROM \`${table}\``);const updated=cols.find(v=>/^updated_?at$/i.test(v.Field));assert.ok(updated);fields[table][fields[table].length-1]=updated.Field;}
  const runId=randomUUID(),dir=path.join(os.tmpdir(),'keepintax-recovery-acceptance',runId);fs.mkdirSync(dir,{recursive:true});
  const scope={runId,database:'keepintax-dev',phase:'PDF',attemptId:a.id,eventId:e.id,docId:d.id,issuerBusinessNumber:String(d.issuerBusinessNumber),generalDocIndex:String(d.generalDocIndex)};
  const snapshot={scope,fields,rows:{billing_attempt:a,billing_obligation:o,billing_event:e,documents:d,subscription:s},counts:await counts(c),transactionHash:sha(a.cardcom_transaction_id)};
  write(path.join(dir,'snapshot.private.json'),snapshot);write(path.join(dir,'config.json'),scope);
  console.log(JSON.stringify({initialized:true,directory:dir,config:path.join(dir,'config.json'),docId:d.id,docNumber:d.docNumber,attemptId:a.id,eventId:e.id}));
 }finally{await c.end();}
}
async function prepare(c,s,dir){
 await c.beginTransaction();try{
  for(const table of ['subscription','billing_attempt','billing_obligation','billing_event','documents'])await one(c,table,s.rows[table].id,true);
  const a=await one(c,'billing_attempt',s.scope.attemptId);assert.equal(a.status,'COMPLETED');assert.equal(sha(a.cardcom_transaction_id),s.transactionHash);
  const meta={...metadata(s.rows.billing_event.metadata),attemptId:s.scope.attemptId,devRecoveryProbe:s.scope.runId,receiptEmail:{sent:false,attempts:0}};
  await c.query('UPDATE documents SET billing_attempt_id=?,file=NULL,copyFile=NULL,recipientName=?,recipientEmail=? WHERE id=?',[s.scope.attemptId,'DEV RECOVERY TEST','dev-recovery@localhost',s.scope.docId]);
  await c.query('UPDATE billing_event SET billing_attempt_id=?,receipt_email_sent=0,metadata=? WHERE id=?',[s.scope.attemptId,JSON.stringify(meta),s.scope.eventId]);
  await c.query("UPDATE billing_attempt SET status='CAPTURED',completed_at=NULL,state_version=state_version+1,next_action_at=UTC_TIMESTAMP(6),failure_category=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=?",[s.scope.attemptId]);
  await c.query("UPDATE billing_obligation SET status='OPEN',active_attempt_id=?,satisfied_attempt_id=NULL,satisfied_at=NULL,version=version+1 WHERE id=?",[s.scope.attemptId,s.rows.billing_obligation.id]);
  await c.query('UPDATE subscription SET current_period_start=? WHERE id=?',[s.rows.billing_obligation.period_start,s.rows.subscription.id]);
  await c.commit();audit(dir,'FIXTURE_PREPARED');
 }catch(e){await c.rollback();throw e;}
}
async function restore(c,s,dir){
 await c.beginTransaction();try{
  const current=await one(c,'billing_attempt',s.scope.attemptId,true);assert.equal(sha(current.cardcom_transaction_id),s.transactionHash,'Provider transaction changed; do not silently restore');
  for(const table of ['documents','billing_event','billing_attempt','billing_obligation','subscription']){
   const row=s.rows[table],names=s.fields[table];const values=names.map(k=>k==='metadata'&&typeof row[k]!=='string'?JSON.stringify(row[k]):row[k]);
   await c.query(`UPDATE \`${table}\` SET ${names.map(k=>`\`${k}\`=?`).join(',')} WHERE id=?`,[...values,row.id]);
  }
  await c.query("DELETE FROM billing_event WHERE id<>? AND billing_attempt_id=? AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.devRecoveryProbe'))=?",[s.scope.eventId,s.scope.attemptId,s.scope.runId]);
  await c.commit();
  for(const table of Object.keys(s.fields)){const restored=await one(c,table,s.rows[table].id);for(const key of s.fields[table]){if(key==='metadata')assert.deepEqual(metadata(restored[key]),metadata(s.rows[table][key]));else assert.deepEqual(restored[key],s.rows[table][key],`${table}.${key} restore mismatch`);}}
  assert.deepEqual(await counts(c),s.counts);audit(dir,'FIXTURE_RESTORED');
 }catch(e){await c.rollback().catch(()=>{});throw e;}
}
async function run(){
 assert.ok(directory,'Provide the initialized private run directory');
 const s=read(path.join(directory,'snapshot.private.json')),c=await db(),client=await cloud();let prepared=false,result={runId:s.scope.runId,docId:s.scope.docId,docNumber:s.rows.documents.docNumber,attemptId:s.scope.attemptId,eventId:s.scope.eventId};
 try{
  assert.ok(logs(directory).some(v=>v.type==='ADAPTERS_INSTALLED'),'Start the scoped worker before running');
  const scheduler=(await client.request({url:'https://cloudscheduler.googleapis.com/v1/projects/keepintax-dev/locations/europe-west1/jobs/billing-completion-repair-dev',timeout:10000})).data;assert.equal(scheduler.state,'PAUSED','Pause the daily repair before fixture changes');
  assert.equal((await api(client,parent)).state,'RUNNING');assert.equal(((await api(client,`${parent}/tasks`)).tasks??[]).length,0);
  await prepare(c,s,directory);prepared=true;
  await publish(client,directory,'CAPTURE',s.scope.attemptId);
  const pdfFailure=await wait('PDF first failure',async()=>{const v=await state(c,s);return logs(directory).some(x=>x.type==='PDF_FAULT')&&String(v.a.failure_category).includes('RECEIPT_STEP_FAILED')?v:null;});
  assert.equal(pdfFailure.a.status,'CAPTURED');assert.equal(pdfFailure.d.file,null);assert.equal(pdfFailure.e.receipt_doc_id,s.scope.docId);assert.equal(pdfFailure.a.receipt_doc_id,s.scope.docId);assert.ok(pdfFailure.a.next_action_at);
  console.log(JSON.stringify({phase:'PDF',firstFailureObserved:true,docId:s.scope.docId,status:pdfFailure.a.status,retryScheduled:true}));
  const pdfSuccess=await wait('PDF real queue retry',async()=>{const v=await state(c,s);return v.a.status==='COMPLETED'&&v.e.receipt_email_sent===1?v:null;});
  assert.equal(pdfSuccess.a.receipt_doc_id,s.scope.docId);assert.equal(pdfSuccess.d.docNumber,s.rows.documents.docNumber);assert.equal(sha(pdfSuccess.a.cardcom_transaction_id),s.transactionHash);assert.ok(pdfSuccess.d.file.startsWith(`dev-recovery://${s.scope.runId}/`));assert.ok(pdfSuccess.d.copyFile);
  let entries=logs(directory);assert.equal(entries.filter(x=>x.phase==='PDF'&&x.type==='PDF_FAULT').length,1);assert.equal(entries.filter(x=>x.phase==='PDF'&&x.type==='PDF_RENDERED').length,2);assert.equal(entries.filter(x=>x.phase==='PDF'&&x.type==='MAIL_ACCEPTED_LOCAL').length,1);
  const pdfPath=pdfSuccess.d.file,copyPath=pdfSuccess.d.copyFile,pdfHash=sha(fs.readFileSync(path.join(directory,pdfPath.split('/').pop())));
  result.pdf={failure:true,recovered:true,sameDocument:true,sha256:pdfHash};console.log(JSON.stringify({phase:'PDF',recovered:true,sameDocument:true,sha256:pdfHash}));
  await wait('PDF handlers finish',async()=>{const a=logs(directory);return a.filter(x=>x.type==='HANDLE_START').length===a.filter(x=>x.type==='HANDLE_END').length;},15000);
  write(path.join(directory,'config.json'),{...s.scope,phase:'MAIL'});
  await c.query('UPDATE billing_event SET receipt_email_sent=0,metadata=? WHERE id=?',[JSON.stringify({...metadata(pdfSuccess.e.metadata),receiptEmail:{sent:false,attempts:0},devRecoveryProbe:s.scope.runId}),s.scope.eventId]);
  await publish(client,directory,'MAIL',s.scope.eventId);
  const mailFailure=await wait('mail first failure',async()=>{const v=await state(c,s);return logs(directory).some(x=>x.phase==='MAIL'&&x.type==='MAIL_FAULT')&&v.mail.attempts===1&&v.mail.nextAttemptAt&&!v.mail.leaseId?v:null;});
  assert.equal(mailFailure.a.status,'COMPLETED');assert.equal(mailFailure.d.file,pdfPath);console.log(JSON.stringify({phase:'MAIL',firstFailureObserved:true,attemptStillCompleted:true,pdfUnchanged:true,retryScheduled:true}));
  const mailSuccess=await wait('mail real queue retry',async()=>{const v=await state(c,s);return v.e.receipt_email_sent===1&&v.mail.sent===true?v:null;});
  assert.equal(mailSuccess.mail.attempts,2);assert.equal(mailSuccess.d.file,pdfPath);assert.equal(mailSuccess.d.copyFile,copyPath);assert.equal(sha(fs.readFileSync(path.join(directory,pdfPath.split('/').pop()))),pdfHash);
  entries=logs(directory);assert.equal(entries.filter(x=>x.phase==='MAIL'&&x.type==='PDF_RENDERED').length,0);assert.equal(entries.filter(x=>x.phase==='MAIL'&&x.type==='MAIL_ACCEPTED_LOCAL').length,1);assert.equal(entries.filter(x=>x.type.startsWith('FORBIDDEN_')).length,0);
  const currentCounts=await counts(c);assert.equal(currentCounts.documents,s.counts.documents);assert.equal(currentCounts.attempts,s.counts.attempts);
  result.mail={failure:true,recovered:true,attempts:2,attemptStillCompleted:true,pdfUnchanged:true};result.newInvoiceCount=0;result.newChargeAttempts=0;
  console.log(JSON.stringify({phase:'MAIL',recovered:true,deliveryAttempts:2,pdfUnchanged:true,newInvoices:0,newChargeAttempts:0}));
 }catch(e){result.error=String(e.message).slice(0,240);process.exitCode=1;console.error(JSON.stringify({acceptanceFailed:true,error:result.error}));}
 finally{
  try{
   await api(client,`${parent}:pause`,'POST',{});
   await wait('in-flight handlers before cleanup',async()=>{const a=logs(directory);return a.filter(x=>x.type==='HANDLE_START').length===a.filter(x=>x.type==='HANDLE_END').length;},20000);
   const tasks=[...new Set(logs(directory).filter(v=>v.type==='TASK_PUBLISH').map(v=>v.name))];
   for(const name of tasks){assert.ok(name.startsWith(`${parent}/tasks/`));try{await api(client,name,'DELETE');}catch(e){if(e.response?.status!==404)throw e;}}
   write(path.join(directory,'config.json'),{...s.scope,phase:'DONE'});
   if(prepared){await restore(c,s,directory);result.restored=true;}
   result.finalCounts=await counts(c);result.finishedAt=new Date().toISOString();write(path.join(directory,'result.json'),result);
   console.log(JSON.stringify({cleanupComplete:true,restored:result.restored,counts:result.finalCounts,report:path.join(directory,'result.json')}));
  }catch(e){result.cleanupError=String(e.message).slice(0,240);write(path.join(directory,'result.json'),result);console.error(JSON.stringify({cleanupFailed:true,error:result.cleanupError,snapshot:path.join(directory,'snapshot.private.json')}));process.exitCode=1;}
  await c.end();
 }
}
if(mode==='init')initialize().catch(e=>{console.error(JSON.stringify({initializationFailed:true,error:String(e.message).slice(0,200)}));process.exitCode=1;});
else if(mode==='run')run().catch(e=>{console.error(JSON.stringify({runFailed:true,error:String(e.message).slice(0,200)}));process.exitCode=1;});
else console.log('Usage: node scripts/qa/verify-billing-recovery-dev.cjs init | run PRIVATE_RUN_DIRECTORY');
