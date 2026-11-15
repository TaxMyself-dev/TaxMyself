/** Dedicated dev-only additive fixture. Never resets an existing user. */
import 'reflect-metadata';
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as admin from 'firebase-admin';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { DemoDataModule } from '../src/demo-data/demo-data.module';
import { DemoDataService } from '../src/demo-data/demo-data.service';
import { ASSISTANT_QA_PROFILE as profile, QA_MAIN, QA_SECOND, QA_EMAIL, QA_PASSWORD, QA_EXPENSES, QA_CLIENTS, QA_SALES } from '../src/demo-data/profiles/assistant-qa.profile';
import { ReportsModule } from '../src/reports/reports.module';
import { ReportsService } from '../src/reports/reports.service';
import { ReportReviewService } from '../src/reports/report-review.service';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';
import { ExpensesService } from '../src/expenses/expenses.service';
import { ClientsService } from '../src/clients/clients.service';
import { ClientsModule } from '../src/clients/clients.module';
import { DocumentsService } from '../src/documents/documents.service';
import { User } from '../src/users/user.entity';
import { Business } from '../src/business/business.entity';
import { Expense } from '../src/expenses/expenses.entity';
import { Clients } from '../src/clients/clients.entity';
import { ExtractedDocument, ExtractedDocStatus, ExtractedDocumentType } from '../src/documents/extracted-document.entity';
import { FullTransactionCache } from '../src/transactions/full-transaction-cache.entity';
import { SlimTransaction } from '../src/transactions/slim-transaction.entity';
import { Source } from '../src/transactions/source.entity';
import { Documents } from '../src/documents/documents.entity';
import { DocPayments } from '../src/documents/doc-payments.entity';
import PDFDocument = require('pdfkit');
import { createConnection } from 'mysql2/promise';
import { ClassificationType } from '../src/transactions/enums/classification-type.enum';
import { DocumentKind, DocumentType, RecordSource } from '../src/enum';

process.env.DISABLE_SYNCHRONIZE = 'true';
process.env.SKIP_BOOT_SEED = 'true';
if (process.env.DB_DATABASE !== 'keepintax-dev') throw new Error('Only keepintax-dev is allowed');

// No AppModule or ScheduleModule: no HTTP listener, crons, syncs or workers.
@Module({ imports: [TypeOrmModule.forRoot({ type: 'mysql', host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: 'keepintax-dev', timezone: 'Z', entities: [resolve(__dirname, '../src/**/*.entity.ts')], autoLoadEntities: true, synchronize: false, logging: false }), DemoDataModule, ReportsModule, ClientsModule] })
class SeedModule {}

const out = resolve(process.env.ASSISTANT_QA_OUTPUT || '../.local/assistant-qa');
const manifestPath = resolve(out, 'manifest.json');
const verifyOnly = process.argv.includes('--verify');
const apply = process.argv.includes('--apply');
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const date = (value: any) => String(value instanceof Date ? value.toISOString().slice(0,10) : value).slice(0,10);

async function incomePdf(business: string, number: string, docDate: string, net: number, vat: number): Promise<Buffer> {
  const doc = new PDFDocument({size:'A4',margin:52});
  const chunks: Buffer[]=[]; doc.on('data',c=>chunks.push(c));
  const result=new Promise<Buffer>((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.fontSize(23).fillColor('#9a2020').text('DEMO ONLY - NOT A TAX DOCUMENT').moveDown();
  doc.fontSize(16).fillColor('#16334b').text('Synthetic issued income document').moveDown();
  doc.fontSize(12).fillColor('#111111').text(`Fictional business: ${business}`).text(`Document number: ${number}`).text(`Date: ${docDate}`).moveDown();
  doc.text('Service: Synthetic QA service').text(`Net: ILS ${net.toFixed(2)}`).text(`VAT: ILS ${vat.toFixed(2)}`).fontSize(18).text(`Total: ILS ${(net+vat).toFixed(2)}`).moveDown();
  doc.fontSize(10).text('For development testing only. No real customer, sale or payment.');doc.end();return result;
}

async function main() {
  assert(apply || verifyOnly, 'Use --apply or --verify explicitly');
  mkdirSync(out, { recursive: true });
  const manifest: any = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { fixture: profile.id, files: {}, issuedFiles: {}, createdAt: new Date().toISOString() };
  if (!manifest.firebaseId) manifest.password = manifest.password || QA_PASSWORD || randomBytes(20).toString('base64url');
  profile.password = manifest.password || QA_PASSWORD;
  const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"|"$/g, '') }), storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['error','warn'] });
  // Stable audit serialization: always use the same local-driver timezone,
  // independently of the application connection's UTC DATE handling.
  const audit = await createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:'keepintax-dev',timezone:'local',supportBigNumbers:true,bigNumberStrings:true});
  try {
    const ds = app.get(DataSource);
    assert((await ds.query('SELECT DATABASE() db'))[0].db === 'keepintax-dev', 'Database check failed');
    const users = ds.getRepository(User);
    let user = await users.findOne({ where: { email: QA_EMAIL } });
    if (user) assert(manifest.firebaseId === user.firebaseId, 'Existing identity is not owned by this seed manifest; refusing changes');
    if (!user) {
      assert(apply, 'Demo has not been created');
      const collision = await ds.getRepository(Business).find({ where: [{ businessNumber: QA_MAIN }, { businessNumber: QA_SECOND }] });
      assert(collision.length === 0, 'Business number collision; refusing changes');
      assert(!(await users.findOne({ where: { id: QA_MAIN } })), 'Person ID collision');
      let firebaseExists = false;
      try { await admin.auth().getUserByEmail(QA_EMAIL); firebaseExists = true; } catch (e: any) { if (e.code !== 'auth/user-not-found') throw e; }
      assert(!firebaseExists, 'Firebase email collision; refusing changes');
      // Capture existing records before creation; compare those same IDs afterwards.
      manifest.baseline = {};
      for (const table of ['user','business','expense','documents','clients','supplier','full_transactions_cache','slim_transactions','extracted_document','journal_entry','journal_line']) {
        // Table names come only from this fixed allowlist.
        const [rows] = await audit.query(`SELECT * FROM \`${table}\``) as any;
        manifest.baseline[table] = { count: rows.length, digest: sha(rows), rows };
      }
      save();
      const result = await app.get(DemoDataService).seedProfile(profile.id);
      manifest.firebaseId = result.firebaseId; save();
      user = await users.findOneOrFail({ where: { firebaseId: result.firebaseId } });
    }
    const uid = user.firebaseId;
    if (process.argv.includes('--rotate-password')) {
      assert(apply, 'Password rotation requires --apply');
      manifest.password = randomBytes(20).toString('base64url');
      await admin.auth().updateUser(uid, { password: manifest.password });
      save();
    }
    if(manifest.password) writeFileSync(resolve(out,'login.txt'),`Development only\nEmail: ${QA_EMAIL}\nPassword: ${manifest.password}\nDatabase: keepintax-dev\n`);
    const expenseService = app.get(ExpensesService);
    const review = app.get(ReportReviewService);
    const drive = app.get(GoogleDriveService);
    const businesses = await ds.getRepository(Business).find({ where: { firebaseId: uid } });
    const catalog = await ds.query("SELECT s.*, c.name categoryName, a.vatPercent, a.taxPercent FROM sub_category s JOIN category c ON c.id=s.categoryId LEFT JOIN booking_account a ON a.id=s.accountId WHERE s.ownerType='SYSTEM' AND s.isActive=1");
    const subFor = (category: string, sub: string) => { const found = catalog.find((s: any) => s.categoryName === category && s.name === sub); assert(found, `Missing classification ${category}/${sub}`); return found; };
    if (apply && !manifest.completedAt) {
      if (!user.driveFolderId) {
        // Blank recipient: do not send sharing invitations or emails.
        const root = await drive.createUserFolder(`DEV-ONLY-assistant-qa-${uid}`, '');
        await users.update({ firebaseId: uid }, { driveFolderId: root });
        user.driveFolderId = root;
      }
      const folders: Record<string, any> = {};
      for (const business of businesses) {
        folders[business.businessNumber] = await drive.ensureBusinessFolder(user.driveFolderId, business.businessName);
        await ds.getRepository(Business).update({ id: business.id }, { driveFolderId: folders[business.businessNumber].folderId, driveInboxFolderId: folders[business.businessNumber].inboxFolderId, driveProcessedFolderId: folders[business.businessNumber].processedFolderId });
      }
      for (const c of QA_CLIENTS) {
        if (!(await ds.getRepository(Clients).findOne({ where: { userId: uid, name: c.name } }))) await app.get(ClientsService).addClient({ name: c.name, id: c.id, businessNumber: c.business, email: '', phone: '0500000000', address: 'נתוני בדיקה בלבד' } as any, uid);
      }
      const caches = await ds.getRepository(FullTransactionCache).find({ where: { userId: uid }, order: { id: 'ASC' } });
      const sources = await ds.getRepository(Source).find({ where: { userId: uid } });
      for (let i = 0; i < caches.length; i++) {
        const cache = caches[i];
        const source = sources.find(s => s.sourceName === cache.paymentIdentifier);
        assert(source, 'Missing owned source');
        await ds.getRepository(FullTransactionCache).update({ id: cache.id, userId: uid }, { sourceRecordId: source.id });
        if (i >= QA_EXPENSES.length) continue;
        const e = QA_EXPENSES[i];
        const sub = subFor(e.category, e.sub);
        let slim = await ds.getRepository(SlimTransaction).findOne({ where: { userId: uid, externalTransactionId: cache.externalTransactionId } });
        if (!slim) slim = await ds.getRepository(SlimTransaction).save({ userId: uid, externalTransactionId: cache.externalTransactionId, billId: cache.billId!, businessNumber: e.business, sourceRecordId: source.id, classificationType: ClassificationType.ONE_TIME, category: e.category, subCategory: e.sub, subCategoryId: sub.id, taxPercent: Number(sub.taxPercent || 0), vatPercent: Math.round(Number(sub.vatPercent || 0)), reductionPercent: 0, isEquipment: false, isRecognized: e.state !== 'private', confirmed: false, merchantNameSnapshot: e.supplier, transactionDateSnapshot: new Date(e.date), amountSnapshot: -e.sum, currencySnapshot: 'ILS', ilsAmountSnapshot: e.sum });
        const fileKey = `expense-${i+1}`;
        let fileId = manifest.files[fileKey];
        if (!fileId) { fileId = await drive.uploadFile(folders[e.business].processedFolderId, `${fileKey}-DEMO-ONLY.pdf`, readFileSync(resolve(out, 'pdfs', `${fileKey}.pdf`))); manifest.files[fileKey] = fileId; save(); }
        let doc = await ds.getRepository(ExtractedDocument).findOne({ where: { driveFileId: fileId } });
        if (!doc) doc = await ds.getRepository(ExtractedDocument).save({ userId: user.index, businessNumber: e.business, driveFileId: fileId, driveFileName: `${fileKey}-DEMO-ONLY.pdf`, month: e.date.slice(0,7), supplier: e.supplier, supplierId: e.supplierId, date: e.date, invoiceNumber: `QA-2026-${i+1}`, amount: e.sum.toFixed(2), amountBeforeVat: (e.sum / 1.18).toFixed(2), vat: (e.sum - e.sum/1.18).toFixed(2), currency: 'ILS', category: e.category, subCategory: e.sub, subCategoryId: sub.id, vatPercent: String(sub.vatPercent || 0), taxPercent: String(sub.taxPercent || 0), documentType: ExtractedDocumentType.TAX_INVOICE_RECEIPT, documentKind: DocumentKind.EXPENSE_INVOICE, status: ExtractedDocStatus.PENDING_REVIEW, description: 'SYNTHETIC DEMO DOCUMENT - NOT VALID FOR TAX', uploadDate: new Date(), rawResponse: JSON.stringify({ synthetic: true, fixture: profile.id }) });
        if (!doc.matchedTransactionId) await review.linkDocToTx(uid, e.business, doc.id, slim.id);
        let expense = await ds.getRepository(Expense).findOne({ where: { userId: uid, sourceDocumentId: doc.id } });
        if (e.state === 'approved' && !expense) { const result = await review.approveMatched(uid, e.business, doc.id, slim.id, { subCategoryId: sub.id, vatPercent: Number(sub.vatPercent || 0), taxPercent: Number(sub.taxPercent || 0) }); expense = await ds.getRepository(Expense).findOneOrFail({ where: { id: result.expenseId } }); }
        if (e.state !== 'approved' && !expense) {
          expense = await expenseService.addExpense({ supplier: e.supplier, supplierID: e.supplierId, subCategoryId: sub.id, category: e.category, subCategory: e.sub, sum: e.sum, date: new Date(e.date), expenseNumber: `QA-2026-${i+1}`, sourceDocumentId: doc.id, externalTransactionId: cache.externalTransactionId } as any, uid, e.business, false, undefined, undefined, RecordSource.DRIVE, e.state === 'pending');
        }
        await ds.getRepository(Expense).update({ id: expense!.id, userId: uid }, { file: `https://drive.google.com/file/d/${fileId}/view` });
        // Source transferred to an Expense, including a pending submission or
        // private row. Keep both back-pointers honest; approval/journaling is
        // represented independently by Expense.approvalStatus.
        if (e.state !== 'approved') {
          await ds.getRepository(ExtractedDocument).update({ id: doc.id, userId: user.index }, { confirmedExpenseId: expense!.id, status: ExtractedDocStatus.APPROVED });
          await ds.getRepository(SlimTransaction).update({ id: slim.id, userId: uid }, { confirmed: true });
        }
        if (e.state !== 'private' && !(await ds.query('SELECT id FROM supplier WHERE businessNumber=? AND supplierID=?', [e.business,e.supplierId])).length) await expenseService.addSupplier({ supplier: e.supplier, supplierID: e.supplierId, category: e.category, subCategory: e.sub, subCategoryId: sub.id, vatPercent: Number(sub.vatPercent || 0), taxPercent: Number(sub.taxPercent || 0), reductionPercent: 0, isEquipment: false }, uid, e.business);
      }
      // One classified transaction without a document; another stays unclassified.
      const noDoc = caches.find(c => c.merchantName === 'תשלום ללא מסמך הדגמה')!;
      if (!(await ds.getRepository(SlimTransaction).findOne({ where: { userId: uid, externalTransactionId: noDoc.externalTransactionId } }))) {
        const sub = subFor('עסק','הוצאות משרד');
        await ds.getRepository(SlimTransaction).save({ userId: uid, businessNumber: QA_MAIN, externalTransactionId: noDoc.externalTransactionId, billId: noDoc.billId!, sourceRecordId: sources.find(s=>s.sourceName===noDoc.paymentIdentifier)!.id, classificationType: ClassificationType.ONE_TIME, category: 'עסק', subCategory: 'הוצאות משרד', subCategoryId: sub.id, isRecognized: true, confirmed: false, taxPercent: Number(sub.taxPercent), vatPercent: Math.round(Number(sub.vatPercent)), merchantNameSnapshot: noDoc.merchantName, transactionDateSnapshot: new Date('2026-11-10'), amountSnapshot: -177, currencySnapshot: 'ILS' });
      }
      // Separate unmatched supplier PDF, intentionally absent from the bank feed.
      if (!manifest.files['unmatched']) { manifest.files['unmatched'] = await drive.uploadFile(folders[QA_MAIN].processedFolderId, 'unmatched-DEMO-ONLY.pdf', readFileSync(resolve(out,'pdfs','unmatched.pdf'))); save(); }
      if (!(await ds.getRepository(ExtractedDocument).findOne({ where: { driveFileId: manifest.files.unmatched } }))) {
        const sub = subFor('עסק','הוצאות משרד');
        await ds.getRepository(ExtractedDocument).save({ userId: user.index, businessNumber: QA_MAIN, driveFileId: manifest.files.unmatched, driveFileName: 'unmatched-DEMO-ONLY.pdf', month: '2026-11', date: '2026-11-12', supplier: 'מסמך ללא תשלום הדגמה', supplierId: '999200093', invoiceNumber: 'QA-UNMATCHED', amount: '295.00', amountBeforeVat: '250.00', vat: '45.00', currency: 'ILS', subCategoryId: sub.id, category: 'עסק', subCategory: 'הוצאות משרד', documentKind: DocumentKind.EXPENSE_INVOICE, documentType: ExtractedDocumentType.INVOICE, status: ExtractedDocStatus.PENDING_REVIEW, rawResponse: '{"synthetic":true}' });
      }
      for (let i=0; i<QA_SALES.length; i++) {
        const s=QA_SALES[i];
        if ((await ds.getRepository(Documents).find({ where: { issuerBusinessNumber: s.business, recipientName: s.client.name, docDate: s.date as any } })).length) continue;
        const vat=s.business===QA_MAIN ? s.net*0.18 : 0;
        const docType=s.business===QA_MAIN ? DocumentType.TAX_INVOICE_RECEIPT : DocumentType.RECEIPT;
        await app.get(DocumentsService).createDoc({ docData: { issuerBusinessNumber: s.business, recipientName: s.client.name, recipientId: s.client.id, docType, docNumber: String(1001+i), docVatRate: vat?18:0, sumBefDisBefVat: s.net, disSum: 0, sumAftDisBefVAT: s.net, vatSum: vat, sumAftDisWithVAT: s.net+vat, withholdingTaxAmount: 0, docDate: s.date, valueDate: s.date }, linesData: [{ issuerBusinessNumber:s.business, docType, lineNumber:'1', transType:'1', internalNumber:`QA-SALE-${i}`, description:'DEMO ONLY - synthetic service', unitType:'UNIT', unitQuantity:1, sumBefVatPerUnit:s.net, disBefVatPerLine:0, sumAftDisBefVatPerLine:s.net, vatOpts:2, vatRate:vat?18:0, vatPerLine:vat }], paymentData: [] }, uid, false);
      }
    }
    if (apply && !manifest.completedAt) {
      const issuedRows=await ds.getRepository(Documents).find({where:[{issuerBusinessNumber:QA_MAIN},{issuerBusinessNumber:QA_SECOND}]});
      for(const issued of issuedRows) {
        const sale=QA_SALES.find(s=>s.business===issued.issuerBusinessNumber&&s.date===date(issued.docDate)&&s.client.name===issued.recipientName)!;
        if(!issued.file) {
          const path=`systemDocs/${issued.issuerBusinessNumber}/assistant-qa/${issued.id}-DEMO-ONLY.pdf`;
          const bytes=await incomePdf(issued.issuerBusinessNumber,issued.docNumber,date(issued.docDate),sale.net,sale.business===QA_MAIN?sale.net*0.18:0);
          await admin.storage().bucket().file(path).save(bytes,{metadata:{contentType:'application/pdf'}});
          await ds.getRepository(Documents).update({id:issued.id},{file:path,copyFile:path});
          writeFileSync(resolve(out,'pdfs',`income-${issued.id}.pdf`),bytes);
        }
        if(!(await ds.getRepository(DocPayments).findOne({where:{issuerBusinessNumber:issued.issuerBusinessNumber,generalDocIndex:issued.generalDocIndex}}))) {
          await ds.getRepository(DocPayments).save({issuerBusinessNumber:issued.issuerBusinessNumber,generalDocIndex:issued.generalDocIndex,paymentLineNumber:'1',paymentMethod:'4',paymentDate:new Date(sale.date),paymentAmount:sale.net*(sale.business===QA_MAIN?1.18:1),bankNumber:'99',branchNumber:'001',accountNumber:sale.business===QA_MAIN?'99001001':'99002002'});
        }
      }
    }
    const expenses=await ds.getRepository(Expense).find({where:{userId:uid},order:{id:'ASC'}});
    const documents=await ds.getRepository(ExtractedDocument).find({where:{userId:user.index}});
    const issued=await ds.getRepository(Documents).find({where:[{issuerBusinessNumber:QA_MAIN},{issuerBusinessNumber:QA_SECOND}]});
    const caches=await ds.getRepository(FullTransactionCache).find({where:{userId:uid}});
    const slims=await ds.getRepository(SlimTransaction).find({where:{userId:uid}});
    assert(expenses.length===QA_EXPENSES.length,'Expense count mismatch');
    assert(documents.length===QA_EXPENSES.length+1,'Source document count mismatch');
    assert(issued.length===QA_SALES.length,'Issued document count mismatch');
    assert(expenses.filter(e=>e.approvalStatus==='PENDING').length===2,'Pending expense mismatch');
    assert(expenses.filter(e=>e.journalEntryNumber!=null).length===20,'Journalled expense mismatch');
    assert(expenses.every(e=>e.sourceDocumentId && e.file),'Expense source links missing');
    assert(documents.filter(d=>d.confirmedExpenseId!=null).length===23,'Source back-pointers missing');
    assert(issued.every(d=>d.file&&d.copyFile),'Issued PDFs missing');
    const fileChecks:any={};
    if(process.argv.includes('--files')) {
      const checks=documents.map(d=>async()=>{
        const bytes=await drive.downloadFile(d.driveFileId);
        assert(bytes.subarray(0,4).toString()==='%PDF',`Invalid source PDF ${d.id}`);
        return {kind:'source',id:d.id,bytes:bytes.length};
      });
      for(let i=0;i<checks.length;i+=4) for(const item of await Promise.all(checks.slice(i,i+4).map(fn=>fn()))) fileChecks[`source-${item.id}`]=item;
      for(const d of issued) {const [bytes]=await admin.storage().bucket().file(d.file).download();assert(bytes.subarray(0,4).toString()==='%PDF',`Invalid issued PDF ${d.id}`);fileChecks[`issued-${d.id}`]={kind:'issued',id:d.id,bytes:bytes.length};}
      writeFileSync(resolve(out,'file-verification.json'),JSON.stringify(fileChecks,null,2));
      const environment=readFileSync(resolve(__dirname,'../../frontend/src/environments/environment.ts'),'utf8');
      const apiKey=environment.match(/apiKey:\s*["']([^"']+)/)?.[1];
      assert(apiKey,'Missing frontend Firebase API key');
      const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:QA_EMAIL,password:manifest.password||QA_PASSWORD,returnSecureToken:true})});
      const login:any=await response.json();
      assert(response.ok&&login.localId===uid,'Demo password login verification failed');
      writeFileSync(resolve(out,'login-verification.json'),JSON.stringify({email:QA_EMAIL,verified:true,at:new Date().toISOString()},null,2));
      console.log('Verified real PDF downloads:',Object.keys(fileChecks).length,'; password login: passed');
    }
    const fuel = (business: string) => expenses.filter(e=>e.businessNumber===business && e.subCategory==='דלק' && e.journalEntryNumber!=null).reduce((sum,e)=>sum+Math.round(Number(e.sum)*100),0)/100;
    assert(fuel(QA_MAIN)===2360 && fuel(QA_SECOND)===708,'Fuel totals mismatch');
    const reports=app.get(ReportsService);
    const reportData:any={};
    for(const biz of businesses) reportData[biz.businessNumber]={pnl:await reports.createPnLReportFromJournal(uid,biz.businessNumber,new Date('2026-01-01'),new Date('2026-11-15T23:59:59Z')),vat:await reports.createVatReportFromJournal(uid,biz.businessNumber,new Date('2026-09-01'),new Date('2026-10-31T23:59:59Z'))};
    let agentVerification:any=null;
    const domainPath=process.env.ASSISTANT_QA_AGENT_ROOT
      ? resolve(process.env.ASSISTANT_QA_AGENT_ROOT,'backend/src/agent-harness/agent-domain.service.ts')
      : resolve(__dirname,'../src/agent-harness/agent-domain.service.ts');
    if(existsSync(domainPath)) {
      const { AgentDomainService }=require(domainPath);
      const { BusinessService }=require('../src/business/business.service');
      const { Delegation }=require('../src/delegation/delegation.entity');
      const domain=new AgentDomainService(expenseService,app.get(BusinessService),ds.getRepository(Delegation),users);
      const actor={actorFirebaseId:uid,firebaseId:uid,businessNumber:null,delegationScopes:[],isDelegatedAccess:false,isAdminImpersonation:false};
      const query={from:'2026-01-01',to:'2026-11-15',search:'דלק',groupBy:'month'};
      const main=await domain.queryExpenses(actor,{...query,businessNumber:QA_MAIN});
      const all=await domain.queryExpenses(actor,{...query,allBusinesses:true});
      assert(main.totals.sum===2360 && main.pending.count===1 && main.pending.sum===118,'Agent single-business totals mismatch');
      assert(all.complete && all.combined.totals.sum===3068,'Agent combined totals mismatch');
      let requiresBusiness=false;
      try{await domain.queryExpenses(actor,query);}catch(e:any){requiresBusiness=e.code==='BUSINESS_REQUIRED';}
      assert(requiresBusiness,'Agent must require a business when none is active');
      agentVerification={main,all,requiresBusiness};
      writeFileSync(resolve(out,'agent-tools-verification.json'),JSON.stringify(agentVerification,null,2));
    }
    const preserved:any={};
    for (const [table, baseline] of Object.entries(manifest.baseline || {}) as any) {
      const oldRows=baseline.rows;
      const [current]=await audit.query(`SELECT * FROM \`${table}\``) as any;
      // Compare exact pre-existing rows using their original primary identity.
      const key = table==='user' ? 'index' : table==='clients' ? 'clientRowId' : 'id';
      const lookup=new Map(current.map((r:any)=>[String(r[key]),r]));
      const normalize=(v:any)=>JSON.parse(JSON.stringify(v));
      const changed=oldRows.filter((r:any)=>sha(normalize(r))!==sha(normalize(lookup.get(String(r[key])))));
      preserved[table]={before:oldRows.length,unchanged:oldRows.length-changed.length,changed:changed.length};
    }
    const evidence={database:'keepintax-dev',verifiedAt:new Date().toISOString(),firebaseId:uid,email:QA_EMAIL,businesses:businesses.map(b=>({number:b.businessNumber,name:b.businessName})),counts:{expenses:expenses.length,sourceDocuments:documents.length,issuedDocuments:issued.length,transactions:caches.length,classifiedTransactions:slims.length},fuel:{main:fuel(QA_MAIN),second:fuel(QA_SECOND),combined:fuel(QA_MAIN)+fuel(QA_SECOND)},reports:reportData,preserved,agentVerification,expenses:expenses.map(e=>({id:e.id,business:e.businessNumber,date:date(e.date),supplier:e.supplier,category:e.category,subCategory:e.subCategory,gross:Number(e.sum),recognized:Number(e.totalTaxPayable),vat:Number(e.totalVatPayable),status:e.approvalStatus,journal:e.journalEntryNumber,sourceDocumentId:e.sourceDocumentId})),issued,sourceDocuments:documents.map(d=>({id:d.id,file:d.driveFileId,status:d.status,expense:d.confirmedExpenseId,transaction:d.matchedTransactionId}))};
    writeFileSync(resolve(out,'verification.json'),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({email:QA_EMAIL,counts:evidence.counts,fuel:evidence.fuel,preserved},null,2));
    manifest.completedAt=new Date().toISOString(); save();
  } finally { await audit.end(); await app.close(); await admin.app().delete(); }
}
main().catch(e=>{ console.error('Assistant demo failed:',e.code||e.message); process.exitCode=1; });
