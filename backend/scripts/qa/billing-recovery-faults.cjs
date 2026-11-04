// Local acceptance adapters only. Never installed by ordinary startup or via HTTP.
const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');

function install(app, configPath) {
  if (process.env.BILLING_DEV_COMPLETION_ONLY !== 'true' || process.env.DB_DATABASE !== 'keepintax-dev' ||
    process.env.BILLING_TASKS_PROJECT_ID !== 'keepintax-dev' || process.env.DISABLE_SYNCHRONIZE !== 'true' ||
    process.env.SKIP_BOOT_SEED !== 'true') throw new Error('Recovery fault adapters require the isolated keepintax-dev worker');
  const config = () => {
    const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (c.database !== 'keepintax-dev' || !/^[a-f0-9-]{36}$/.test(c.runId) ||
      !['PDF', 'MAIL', 'DONE'].includes(c.phase) || ![c.attemptId,c.eventId,c.docId].every(v=>Number.isSafeInteger(v)&&v>0)) {
      throw new Error('Invalid recovery probe scope');
    }
    return c;
  };
  const scope = config();
  const directory = path.dirname(path.resolve(configPath));
  const audit = (type, detail={}) => fs.appendFileSync(path.join(directory,'audit.ndjson'), JSON.stringify({at:new Date().toISOString(),phase:config().phase,type,...detail})+'\n');
  const faultOnce = phase => {
    try { fs.closeSync(fs.openSync(path.join(directory,`${phase}.failed-once`),'wx')); return true; }
    catch(e) { if(e.code==='EEXIST') return false; throw e; }
  };
  const digest = b => createHash('sha256').update(b).digest('hex');
  const backend = path.resolve(__dirname,'../..');
  const { BillingReceiptService }=require(path.join(backend,'dist/billing/services/billing-receipt.service'));
  const { BillingCompletionRecoveryService }=require(path.join(backend,'dist/billing/services/billing-completion-recovery.service'));
  const { BillingTasksService }=require(path.join(backend,'dist/billing/services/billing-tasks.service'));
  const receipt=app.get(BillingReceiptService);
  const documents=receipt.documentsService;
  const events=receipt.billingEventService;
  const mail=receipt.mailService;
  // Local Chromium preview rendering only: no remote renderer or legal signing.
  delete process.env.PDF_SERVICE_URL;
  delete process.env.K_SERVICE;
  const originalRender=documents.generatePDF.bind(documents);
  documents.generatePDF=async(data,type,isCopy=false)=>{
    const c=config();
    if(c.phase==='DONE'||data?.docData?.id!==scope.docId) throw Error('Out-of-scope PDF blocked by dev probe');
    audit('PDF_CALL',{copy:isCopy});
    if(c.phase==='PDF'&&faultOnce('PDF')) { audit('PDF_FAULT'); throw Error('DEV_PROBE_PDF_GENERATION_TIMEOUT'); }
    try {
      const marked={...data,docData:{...data.docData,recipientName:'DEV RECOVERY TEST',docSubtitle:'DEV RECOVERY ACCEPTANCE — NOT AN ISSUED DOCUMENT'}};
      const bytes=Buffer.from(await originalRender(marked,'previewDoc',isCopy));
      if(bytes.subarray(0,5).toString()!=='%PDF-'||bytes.length<1000) throw Error('Invalid rendered test PDF');
      audit('PDF_RENDERED',{copy:isCopy,bytes:bytes.length,sha256:digest(bytes)});
      return bytes;
    } catch(e) { audit('PDF_RENDER_ERROR',{message:String(e.message).slice(0,180)}); throw e; }
  };
  documents.fillFasterSigner.sign=async()=>{ audit('FORBIDDEN_SIGN'); throw Error('Legal signing blocked by dev acceptance'); };
  documents.uploadToFirebase=async(buffer,issuer,index,docType,fileName,fileType)=>{
    if(String(issuer)!==scope.issuerBusinessNumber||String(index)!==scope.generalDocIndex) throw Error('Out-of-scope storage write blocked');
    const name=`${fileType}-${randomUUID()}.pdf`;
    fs.writeFileSync(path.join(directory,name),buffer);
    audit('PDF_STORED_LOCAL',{fileType,sha256:digest(buffer)});
    return `dev-recovery://${scope.runId}/${name}`;
  };
  documents.downloadFromFirebase=async(file)=>{
    const prefix=`dev-recovery://${scope.runId}/`;
    if(typeof file!=='string'||!file.startsWith(prefix)) throw Error('External storage read blocked by dev acceptance');
    const name=file.slice(prefix.length);
    if(path.basename(name)!==name) throw Error('Invalid local PDF path');
    const bytes=fs.readFileSync(path.join(directory,name));
    audit('PDF_READ_LOCAL',{sha256:digest(bytes)});
    return bytes;
  };
  for(const method of ['createBillingSystemReceipt','createDoc']) {
    documents[method]=async()=>{ audit('FORBIDDEN_INVOICE_CREATE',{method}); throw Error('New invoice creation blocked during existing-invoice test'); };
  }
  mail.sendMailWithAttachment=async(to,subject,text,buffer,attachmentName)=>{
    const c=config();
    if(c.phase==='DONE'||to!=='dev-recovery@localhost') throw Error('Out-of-scope email blocked');
    audit('MAIL_CALL',{sha256:digest(buffer)});
    if(c.phase==='MAIL'&&faultOnce('MAIL')) { audit('MAIL_FAULT'); throw Error('socket hang up (DEV_PROBE_MAIL_TRANSPORT)'); }
    const name=`mail-${randomUUID()}.eml`,boundary=`dev-${randomUUID()}`;
    const mime=[`From: dev@test.invalid`,`To: dev-recovery@localhost`,`Subject: DEV ACCEPTANCE ${subject}`,
      'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,
      'Content-Type: text/plain; charset=utf-8','','Local recovery acceptance only.',`--${boundary}`,
      'Content-Type: application/pdf','Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${String(attachmentName).replace(/[^a-zA-Z0-9_.-]/g,'_')}"`,'',
      buffer.toString('base64'),`--${boundary}--`,''].join('\r\n');
    fs.writeFileSync(path.join(directory,name),mime);
    audit('MAIL_ACCEPTED_LOCAL',{file:name,sha256:digest(buffer)});
    return {messageId:`dev-local-${randomUUID()}`};
  };
  mail.sendMail=async()=>{audit('FORBIDDEN_OTHER_MAIL');throw Error('External mail blocked during dev acceptance');};
  const originalLog=events.logEvent.bind(events);
  events.logEvent=async input=>{
    if(input.billingAttemptId!==scope.attemptId) throw Error('Out-of-scope audit event blocked');
    return originalLog({...input,metadata:{...(input.metadata??{}),devRecoveryProbe:scope.runId}});
  };
  const tasks=app.get(BillingTasksService);
  const originalEnqueue=tasks.enqueue.bind(tasks);
  tasks.enqueue=async(kind,id,due=new Date(),generation='')=>{
    if(!((kind==='CAPTURE'&&id===scope.attemptId)||(kind==='MAIL'&&id===scope.eventId))) throw Error('Out-of-scope queue submission blocked');
    const identity=generation.startsWith('repair-')?generation:`${due.toISOString()}:${generation}`;
    const hash=digest(`${kind}:${id}:${identity}`);
    const name=`projects/keepintax-dev/locations/europe-west1/queues/billing-completion-dev/tasks/billing-${hash}`;
    audit('TASK_PUBLISH',{name,kind,id,due:due.toISOString()});
    return originalEnqueue(kind,id,due,generation);
  };
  const completion=app.get(BillingCompletionRecoveryService);
  const originalHandle=completion.handle.bind(completion);
  completion.handle=async(kind,id,...rest)=>{
    if(!((kind==='CAPTURE'&&id===scope.attemptId)||(kind==='MAIL'&&id===scope.eventId))) throw Error('Out-of-scope task execution blocked');
    audit('HANDLE_START',{kind,id});
    try{return await originalHandle(kind,id,...rest);}finally{audit('HANDLE_END',{kind,id});}
  };
  audit('ADAPTERS_INSTALLED',{docId:scope.docId,eventId:scope.eventId,attemptId:scope.attemptId});
}
module.exports={install};
