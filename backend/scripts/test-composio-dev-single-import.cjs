// Explicitly approved one-file DEV import. Never boot Nest, AI or schedulers.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DataSource } = require('typeorm');
const cfg = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
const expectedHash = '024e5ece54e5d8d116f632419ef4072cca90549e47c5a65eaf03c709a0e661d2';
const filename = 'keepintax-dev-test.pdf';
const query = 'subject:"KEEPINTAX-DEV-TEST" filename:keepintax-dev-test.pdf has:attachment';
function check(condition, label) { if (!condition) throw Error(label); }
async function main() {
  check(process.argv.slice(2).join(' ') === '--run', 'Explicit --run required');
  check(cfg.DB_DATABASE === 'keepintax-dev' && cfg.COMPOSIO_ENVIRONMENT === 'dev' && cfg.DISABLE_SYNCHRONIZE === 'true' && cfg.COMPOSIO_EMAIL_ENABLED !== 'true', 'DEV configuration required');
  Object.assign(process.env, cfg, { NODE_ENV: 'development', COMPOSIO_ENVIRONMENT: 'dev', COMPOSIO_EMAIL_ENABLED: 'true', DISABLE_SYNCHRONIZE: 'true', COMPOSIO_DOWNLOAD_ALLOWED_HOSTS: 'temp.4d4f16c61d89ec64e760039c4ec50717.r2.cloudflarestorage.com' });
  require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '../dist'), paths: { 'src/*': ['*'] } });
  require('@nestjs/common').Logger.overrideLogger(false);
  const { UserIntegration } = require('../dist/integrations/entities/user-integration.entity');
  const { Business } = require('../dist/business/business.entity');
  const { ImportedDocument } = require('../dist/document-import/entities/imported-document.entity');
  const { UserIntegrationsService } = require('../dist/integrations/services/user-integrations.service');
  const { ComposioClientService } = require('../dist/integrations/services/composio-client.service');
  const { ComposioGmailProvider } = require('../dist/integrations/providers/composio-gmail.provider');
  const { EmailAttachmentDownloadService } = require('../dist/integrations/services/email-attachment-download.service');
  const { GmailReaderService } = require('../dist/integrations/services/gmail-reader.service');
  const { GmailDriveImportService } = require('../dist/integrations/services/gmail-drive-import.service');
  const { DocumentImportService } = require('../dist/document-import/document-import.service');
  const { GoogleDriveService } = require('../dist/google-drive/google-drive.service');
  const db = new DataSource({ type: 'mysql', host: cfg.DB_HOST, port: Number(cfg.DB_PORT || 3306), username: cfg.DB_USERNAME, password: cfg.DB_PASSWORD, database: 'keepintax-dev', entities: [UserIntegration, Business, ImportedDocument], synchronize: false, migrationsRun: false, logging: false, connectTimeout: 10000 });
  await db.initialize();
  let stage = 'preflight';
  const counts = {}; let uploads = 0; let uploadedId;
  try {
    check((await db.query('SELECT DATABASE() AS db'))[0].db === 'keepintax-dev', 'DEV database identity mismatch');
    const integrationRepo = db.getRepository(UserIntegration), businessRepo = db.getRepository(Business), ledger = db.getRepository(ImportedDocument);
    const integration = await integrationRepo.findOneBy({ id: 17 });
    check(integration?.status === 'ACTIVE' && integration.connectionBackend === 'COMPOSIO' && integration.initialImportCompletedAt && integration.lastSyncStatus !== 'RUNNING', 'Verified idle DEV integration required');
    const business = await businessRepo.findOneBy({ id: 5, firebaseId: integration.firebaseId });
    check(business?.businessName === 'נגרות' && business.businessNumber && business.driveFolderId && business.driveInboxFolderId && business.driveProcessedFolderId, 'Selected DEV business folders required');
    const businessBefore = JSON.stringify(business);
    const stable = row => JSON.stringify(Object.fromEntries(['firebaseId','accountId','connectedAccountId','initialImportCompletedAt','initialImportFromDate','initialImportToDate','lastSuccessfulSyncAt','createdAt'].map(key => [key,row[key]])));
    const historyBefore = stable(integration);
    const scopedKey = { firebaseId: integration.firebaseId, businessNumber: business.businessNumber, contentHash: expectedHash };
    check(!await ledger.findOneBy(scopedKey), 'Fixture already registered; do not repeat import');
    const drive = new GoogleDriveService();
    const serviceDrive = drive.getDrive().drive;
    const metadata = async id => (await serviceDrive.files.get({ fileId: id, fields: 'id,name,mimeType,parents,trashed', supportsAllDrives: true })).data;
    const root = await metadata(cfg.GOOGLE_DRIVE_ROOT_FOLDER_ID);
    check(root.name === 'KeepInTax-Clients-Dev' && !root.trashed, 'Exact DEV Drive root required');
    let ancestor = business.driveFolderId; const visited = new Set();
    while (ancestor !== root.id) {
      check(ancestor && !visited.has(ancestor) && visited.size < 10, 'Selected business must descend from DEV root');
      visited.add(ancestor); const folder = await metadata(ancestor);
      check(!folder.trashed && folder.mimeType === 'application/vnd.google-apps.folder' && folder.parents?.length === 1, 'Valid selected folder ancestry required');
      ancestor = folder.parents[0];
    }
    for (const id of [business.driveInboxFolderId, business.driveProcessedFolderId]) {
      const folder = await metadata(id);
      check(!folder.trashed && folder.parents?.includes(business.driveFolderId), 'Selected inbox/processed parent mismatch');
    }
    console.log(JSON.stringify({ stage: 'preflight', database: 'keepintax-dev', integrationId: 17, businessId: 5, businessName: business.businessName, driveRoot: root.name, ancestryVerified: true, fixtureAlreadyImported: false }));
    const allowedFolders = new Set([business.driveInboxFolderId,business.driveProcessedFolderId]); const allowedFiles = new Set();
    const list = drive.listFolderFiles.bind(drive);
    drive.listFolderFiles = async id => { check(allowedFolders.has(id), 'Drive list scope blocked'); const files = await list(id); files.forEach(f => allowedFiles.add(f.id)); return files; };
    const upload = drive.uploadFile.bind(drive);
    drive.uploadFile = async (parent,name,bytes,mime) => {
      check(parent === business.driveInboxFolderId && name === filename && uploads === 0 && bytes.length === 43527 && createHash('sha256').update(bytes).digest('hex') === expectedHash, 'Single fixture upload scope blocked');
      uploads++; uploadedId = await upload(parent,name,bytes,mime); allowedFiles.add(uploadedId); return uploadedId;
    };
    const download = drive.downloadFile.bind(drive);
    drive.downloadFile = async id => { check(allowedFiles.has(id), 'Drive download scope blocked'); return download(id); };
    const remove = drive.deleteFile.bind(drive);
    drive.deleteFile = async id => { check(uploadedId && id === uploadedId, 'Only current-upload compensation allowed'); return remove(id); };
    drive.ensureInboxAndProcessed = async () => { throw Error('Provisioning not authorized in diagnostic'); };
    const integrations = new UserIntegrationsService(integrationRepo);
    const gateway = new ComposioClientService(), sdk = gateway.client();
    const definition = await sdk.tools.getRawComposioToolBySlug('GMAIL_FETCH_EMAILS');
    check(/^\d{8}_\d+$/.test(definition.version), 'Explicit toolkit version required');
    process.env.COMPOSIO_GMAIL_TOOLKIT_VERSION = definition.version;
    let messageId;
    const execute = sdk.tools.execute.bind(sdk.tools);
    sdk.tools.execute = async (slug,options,...rest) => {
      check(options.connectedAccountId === integration.connectedAccountId && options.userId === gateway.userId(integration.firebaseId), 'Mailbox scope blocked');
      const a = options.arguments;
      if (slug === 'GMAIL_FETCH_EMAILS') check(a.query === query && a.max_results === 1 && a.ids_only === true && !a.page_token, 'Fixture-only search required');
      else if (slug === 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID') check(messageId && a.message_id === messageId && a.format === 'full', 'Fixture-only message required');
      else if (slug === 'GMAIL_GET_ATTACHMENT') check(messageId && a.message_id === messageId && a.file_name === filename, 'Fixture-only attachment required');
      else throw Error('Tool blocked');
      counts[slug] = (counts[slug] || 0) + 1; check(counts[slug] === 1, 'Single tool execution budget exceeded');
      const result = await execute(slug,options,...rest);
      if (result.successful && slug === 'GMAIL_FETCH_EMAILS') {
        check(result.data?.messages?.length === 1, 'One artificial message required'); messageId = result.data.messages[0].messageId;
      }
      if (result.successful && slug === 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID') {
        const d=result.data;
        const subject=d.payload?.headers?.find(h=>h.name?.toLowerCase()==='subject')?.value || d.subject;
        check(subject === 'KEEPINTAX-DEV-TEST', 'Exact artificial subject required');
      }
      console.log(JSON.stringify({ stage: slug, successful: result.successful === true })); return result;
    };
    sdk.connectedAccounts.link = sdk.connectedAccounts.delete = async () => { throw Error('Connection changes blocked'); };
    const provider = new ComposioGmailProvider(gateway,integrations,new EmailAttachmentDownloadService());
    const resolver = { resolveTargetBusiness: async () => { throw Error('Explicit selected business required'); } };
    const documentImport = new DocumentImportService(ledger,businessRepo,drive,resolver);
    const importer = new GmailDriveImportService(new GmailReaderService(integrations,provider),documentImport,integrations);
    stage = 'normal-manual-import';
    const result = await importer.importAllForUser(integration.firebaseId,[17],{ businessNumber: business.businessNumber, query, maxMessages: 1 });
    console.log(JSON.stringify({ stage, imported: result.totalImported, alreadyImported: result.totalAlreadyImported, skipped: result.totalSkipped, attachmentsFound: result.totalAttachmentsFound, messagesFailed: result.perAccount[0]?.messagesFailed, accountError: !!result.perAccount[0]?.error }));
    check(result.totalImported === 1 && result.totalSkipped === 0 && result.perAccount.length === 1 && !result.perAccount[0].error, 'Expected exactly one successful import');
    stage = 'verify';
    const saved = await ledger.findOneBy(scopedKey);
    check(saved && saved.source === 'GMAIL' && saved.driveFolderId === business.driveInboxFolderId && saved.filename === filename && saved.size === 43527 && saved.gmailMessageId === messageId, 'Ledger ownership/content/destination verification failed');
    const file = (await drive.getSystemDrive().files.get({ fileId: saved.driveFileId, fields: 'id,name,parents,size,trashed', supportsAllDrives: true })).data;
    check(!file.trashed && file.parents?.includes(business.driveInboxFolderId) && Number(file.size) === 43527, 'Drive destination/size verification failed');
    allowedFiles.add(saved.driveFileId);
    check(createHash('sha256').update(await drive.downloadFile(saved.driveFileId)).digest('hex') === expectedHash, 'Drive bytes mismatch');
    const after = await integrationRepo.findOneBy({ id: 17 });
    check(stable(after) === historyBefore && after.lastSyncStatus === 'SUCCESS', 'Connection history/cursor verification failed');
    check(JSON.stringify(await businessRepo.findOneBy({ id: 5 })) === businessBefore, 'Business configuration changed');
    console.log(JSON.stringify({ status:'verified',database:'keepintax-dev',integrationId:17,businessId:5,businessName:'נגרות',importedDocumentId:saved.id,driveFileId:saved.driveFileId,filename:file.name,bytes:Number(file.size),sha256:expectedHash,driveInboxVerified:true,ownerAndInitialHistoryAndCursorPreserved:true,manualSyncStatus:after.lastSyncStatus,uploads,toolExecutions:counts,applicationStarted:false,schedulerStarted:false,aiInvokedByDiagnostic:false }));
  } catch(error) {
    console.error(JSON.stringify({status:'failed',stage,category:error.category,diagnostic: error.name === 'Error' && /^(Explicit|DEV |Verified idle|Selected |Fixture already|Exact DEV|Valid selected|Drive list scope|Single fixture|Drive download scope|Only current|Provisioning not|Mailbox scope|Fixture-only|Tool blocked|Single tool|One artificial|Exact artificial|Connection changes|Expected exactly|Ledger ownership|Drive destination|Drive bytes|Connection history|Business configuration)/.test(error.message) ? error.message : 'Failure details suppressed',uploads,uploadedFileMayExist:!!uploadedId})); process.exitCode=1;
  } finally { await db.destroy(); }
}
main().catch(()=>{console.error('DEV import diagnostic initialization failed; details suppressed');process.exitCode=1;});
