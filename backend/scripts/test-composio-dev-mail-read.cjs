// Bounded artificial-message DEV diagnostic; no application, scheduler, Drive or import modules.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DataSource } = require('typeorm');
const cfg = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
async function main() {
  if (cfg.DB_DATABASE !== 'keepintax-dev' || cfg.COMPOSIO_ENVIRONMENT !== 'dev' || cfg.DISABLE_SYNCHRONIZE !== 'true' || cfg.COMPOSIO_EMAIL_ENABLED === 'true') throw Error('DEV disabled-app configuration required');
  Object.assign(process.env, cfg, { NODE_ENV: 'development', COMPOSIO_EMAIL_ENABLED: 'true', COMPOSIO_ENVIRONMENT: 'dev', DISABLE_SYNCHRONIZE: 'true' });
  require('@nestjs/common').Logger.overrideLogger(false);
  // Exact temporary storage host observed in the authenticated DEV attachment response.
  process.env.COMPOSIO_DOWNLOAD_ALLOWED_HOSTS = 'temp.4d4f16c61d89ec64e760039c4ec50717.r2.cloudflarestorage.com';
  const { UserIntegration } = require('../dist/integrations/entities/user-integration.entity');
  const { ComposioClientService } = require('../dist/integrations/services/composio-client.service');
  const { ComposioGmailProvider } = require('../dist/integrations/providers/composio-gmail.provider');
  const { EmailAttachmentDownloadService } = require('../dist/integrations/services/email-attachment-download.service');
  const db = new DataSource({ type: 'mysql', host: cfg.DB_HOST, port: Number(cfg.DB_PORT || 3306), username: cfg.DB_USERNAME, password: cfg.DB_PASSWORD, database: 'keepintax-dev', entities: [UserIntegration], synchronize: false, migrationsRun: false, logging: false, connectTimeout: 10000 });
  await db.initialize();
  let stage = 'database';
  try {
    if ((await db.query('SELECT DATABASE() AS db'))[0].db !== 'keepintax-dev') throw Error('Database identity mismatch');
    const repo = db.getRepository(UserIntegration);
    const original = await repo.findOneBy({ id: 17 });
    if (!original || original.status !== 'ACTIVE' || original.connectionBackend !== 'COMPOSIO' || !original.connectedAccountId || original.lastSyncStatus === 'RUNNING') throw Error('Existing verified DEV account required');
    const before = JSON.stringify(original);
    const gateway = new ComposioClientService();
    const sdk = gateway.client();
    const definition = await sdk.tools.getRawComposioToolBySlug('GMAIL_FETCH_EMAILS');
    if (!/^\d{8}_\d+$/.test(definition.version)) throw Error('Explicit toolkit version required');
    process.env.COMPOSIO_GMAIL_TOOLKIT_VERSION = definition.version;
    const query = 'subject:"KEEPINTAX-DEV-TEST" filename:keepintax-dev-test.pdf has:attachment';
    const counts = {};
    let selectedId, selectedAttachment;
    const execute = sdk.tools.execute.bind(sdk.tools);
    sdk.tools.execute = async (slug, options, ...rest) => {
      const a = options.arguments;
      if (options.connectedAccountId !== original.connectedAccountId || options.userId !== gateway.userId(original.firebaseId)) throw Error('Account scope blocked');
      if (slug === 'GMAIL_FETCH_EMAILS') {
        if (a.query !== query || a.max_results !== 5 || a.page_token || a.ids_only !== true) throw Error('Search scope blocked');
      } else if (slug === 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID') {
        if (!selectedId || a.message_id !== selectedId || a.format !== 'full') throw Error('Read scope blocked');
      } else if (slug === 'GMAIL_GET_ATTACHMENT') {
        if (!selectedId || !selectedAttachment || a.message_id !== selectedId || a.attachment_id !== selectedAttachment || a.file_name !== 'keepintax-dev-test.pdf') throw Error('Attachment scope blocked');
      } else throw Error('Tool blocked');
      counts[slug] = (counts[slug] || 0) + 1;
      if (counts[slug] > 1) throw Error('Diagnostic execution budget exceeded');
      const result = await execute(slug, options, ...rest);
      const d = result.data;
      console.log(JSON.stringify({ stage: slug, successful: result.successful === true, dataKeys: d && typeof d === 'object' ? Object.keys(d) : [], firstMessageKeys: slug === 'GMAIL_FETCH_EMAILS' && d?.messages?.[0] ? Object.keys(d.messages[0]) : undefined }));
      if (slug === 'GMAIL_GET_ATTACHMENT' && d?.file?.s3url) {
        const url = new URL(d.file.s3url);
        console.log(JSON.stringify({ downloadHost: url.hostname }));
        // The exact host must already be explicitly configured; no wildcard/automatic trust.
      }
      return result;
    };
    sdk.connectedAccounts.delete = async () => { throw Error('Deletion blocked'); };
    sdk.connectedAccounts.link = async () => { throw Error('New connection blocked'); };
    const provider = new ComposioGmailProvider(gateway, {
      findByConnectedAccountId: async (id, owner) => id === original.connectedAccountId && owner === original.firebaseId ? repo.findOneBy({ id: 17 }) : null,
      expireConnectedAccount: async () => { throw Error('Diagnostic does not modify integration records'); },
    }, new EmailAttachmentDownloadService());
    const account = { firebaseId: original.firebaseId, connectedAccountId: original.connectedAccountId, environment: 'dev' };
    stage = 'search';
    const listed = await provider.listMessages(account, query, 5);
    if (!listed.ids.length) throw Error('Artificial fixture not found');
    selectedId = listed.ids[0];
    stage = 'read';
    const message = await provider.getMessage(account, selectedId);
    const subject = message.payload.headers?.find(h => h.name.toLowerCase() === 'subject')?.value;
    if (subject !== 'KEEPINTAX-DEV-TEST') throw Error('Exact artificial subject mismatch');
    const parts = [];
    function walk(part) { parts.push(part); for (const child of part.parts || []) walk(child); }
    walk(message.payload);
    const attachment = parts.find(p => p.filename === 'keepintax-dev-test.pdf' && p.body?.attachmentId);
    if (!attachment) throw Error('Exact artificial attachment not found');
    selectedAttachment = attachment.body.attachmentId;
    stage = 'download';
    const bytes = await provider.downloadAttachment(account, selectedId, selectedAttachment, 'keepintax-dev-test.pdf');
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw Error('PDF signature mismatch');
    const unchanged = JSON.stringify(await repo.findOneBy({ id: 17 })) === before;
    if (!unchanged) throw Error('Integration record changed during diagnostic');
    console.log(JSON.stringify({ status: 'verified', database: 'keepintax-dev', integrationId: 17, toolkitVersion: definition.version, matchedMessages: listed.ids.length, readMessages: 1, filename: 'keepintax-dev-test.pdf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), pdfSignatureVerified: true, integrationAndHistoryUnchanged: unchanged, toolExecutions: counts, driveOperations: 0, imports: 0, schedulerStarted: false, fileSavedToDisk: false }));
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', stage, category: error.category || undefined, diagnostic: error.category ? undefined : (/^(Artificial|Exact|PDF|Integration|Existing|Database|Diagnostic|Explicit)/.test(error.message) ? error.message : 'Redacted diagnostic failure') }));
    process.exitCode = 1;
  } finally { await db.destroy(); }
}
main().catch(() => { console.error('DEV diagnostic failed; details suppressed'); process.exitCode = 1; });
