'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  crypto = require('crypto');
const backend = path.resolve(__dirname, '../..');
process.chdir(backend);
const config = require('dotenv').parse(
  fs.readFileSync(path.join(backend, '.env')),
);
assert.equal(config.DB_DATABASE, 'keepintax-dev');
assert.equal(config.DISABLE_SYNCHRONIZE, 'true');
assert.equal(config.GMAIL_DURABLE_PROCESS_ENABLED, 'false');
assert.equal(config.GMAIL_DURABLE_DELETE_ENABLED, 'false');
Object.assign(process.env, config);
require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const { DataSource } = require('typeorm');
const classes = {};
function load(rel, name) {
  return (classes[name] = require(path.join(backend, 'dist', rel))[name]);
}
load('email-intake/email-intake.store', 'EmailIntakeStore');
load('email-intake/email-intake.storage', 'EmailIntakeStorage');
load('email-intake/email-processing.worker', 'EmailProcessingWorker');
load('protected-pdf/pdf-inspection.service', 'PdfInspectionService');
load('protected-pdf/protected-pdf.store', 'ProtectedPdfStore');
load('protected-pdf/protected-pdf.service', 'ProtectedPdfService');
load('protected-pdf/protected-pdf.worker', 'ProtectedPdfWorker');
load('google-drive/google-drive.service', 'GoogleDriveService');
load('documents/document-processor.service', 'DocumentProcessorService');
load('documents/documents.service', 'DocumentsService');
load('bookkeeping/catalog.service', 'CatalogService');
load('bookkeeping/catalog-context.service', 'CatalogContextService');
load('shared/fx-rate.service', 'FxRateService');
load('integrations/services/gmail-reader.service', 'GmailReaderService');
load(
  'integrations/services/user-integrations.service',
  'UserIntegrationsService',
);
load('integrations/services/composio-client.service', 'ComposioClientService');
load(
  'integrations/services/email-attachment-download.service',
  'EmailAttachmentDownloadService',
);
load('integrations/providers/composio-gmail.provider', 'ComposioGmailProvider');
const db = new DataSource({
  type: 'mysql',
  host: config.DB_HOST,
  port: Number(config.DB_PORT || 3306),
  username: config.DB_USERNAME,
  password: config.DB_PASSWORD,
  database: config.DB_DATABASE,
  entities: [path.join(backend, 'dist', '**', '*.entity.js')],
  synchronize: false,
  dropSchema: false,
  migrationsRun: false,
  logging: false,
  timezone: 'Z',
  extra: { connectionLimit: 6 },
});
const instances = new Map(),
  unused = new Set();
function service(C) {
  if (instances.has(C)) return instances.get(C);
  const params = Reflect.getMetadata('design:paramtypes', C) || [],
    injected = Reflect.getMetadata('self:paramtypes', C) || [];
  const args = params.map((T, i) => {
    const token = injected.find((x) => x.index === i)?.param;
    if (typeof token === 'string' && token.endsWith('Repository')) {
      const name = token.slice(0, -10),
        meta = db.entityMetadatas.find((x) => x.targetName === name);
      assert.ok(meta, 'Repository metadata ' + name);
      return db.getRepository(meta.target);
    }
    if (T?.name === 'DataSource') return db;
    if (T?.name === 'EmailProvider')
      return service(classes.ComposioGmailProvider);
    if (classes[T?.name]) return service(classes[T.name]);
    unused.add(C.name + ':' + (T?.name || 'forwardRef'));
    return Object.freeze({});
  });
  const value = new C(...args);
  instances.set(C, value);
  return value;
}
async function inspect() {
  await db.initialize();
  const [identity] = await db.query('SELECT DATABASE() AS db');
  assert.equal(identity.db, 'keepintax-dev');
  const [account] = await db.query(
    'SELECT id,firebase_id,status,connection_backend FROM user_integrations WHERE id=17',
  );
  assert.equal(account.status, 'ACTIVE');
  assert.equal(account.connection_backend, 'COMPOSIO');
  const business = await db
    .getRepository('Business')
    .findOneBy({ id: 5, firebaseId: account.firebase_id });
  assert.equal(business.businessName, 'נגרות');
  assert.ok(business.driveInboxFolderId && business.driveProcessedFolderId);
  const docs = service(classes.DocumentsService),
    catalog = await docs.buildExtractionCatalog(
      account.firebase_id,
      business.businessNumber,
    );
  const pending = await db.query(
    "SELECT email_work_state,COUNT(*) AS n FROM imported_documents WHERE email_work_state<>'LEGACY' GROUP BY email_work_state",
  );
  console.log(
    JSON.stringify({
      mode: 'inspect',
      db: 'keepintax-dev',
      metadataEntities: db.entityMetadatas.length,
      businessId: 5,
      realCatalogEntries: catalog.length,
      pending,
      unusedDependencies: [...unused],
    }),
  );
  return { account, business, docs };
}
// An explicit existing workspace folder; generated evidence contains no credentials.
const evidenceRoot = path.resolve(
  process.env.KEEPINTAX_QA_EVIDENCE_DIR ||
    path.join(require('os').tmpdir(), 'keepintax-gmail-qa'),
);
let manifest, scanLock;
function save() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const target = path.join(evidenceRoot, manifest.op + '.json');
  fs.writeFileSync(target + '.tmp', JSON.stringify(manifest, null, 2));
  fs.renameSync(target + '.tmp', target);
}
function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
async function pdf(pages, options = {}) {
  const PDF = require('pdfkit');
  return new Promise((resolve, reject) => {
    const d = new PDF({ autoFirstPage: false, ...options }),
      parts = [];
    d.on('data', (c) => parts.push(c));
    d.on('error', reject);
    d.on('end', () => resolve(Buffer.concat(parts)));
    d.info.Title = manifest.op;
    for (const page of pages) {
      d.addPage();
      d.fontSize(9).text('DEV QA / FICTITIOUS SAMPLE / ' + manifest.op);
      d.moveDown(2);
      d.fontSize(20).text(page.title);
      d.moveDown();
      d.fontSize(12).text(page.body);
    }
    d.end();
  });
}
const positivePages = [
  [
    'Tax Invoice',
    'invoice',
    'Total including VAT: ILS 118.00. Net ILS 100.00; VAT ILS 18.00. Payment is due.',
  ],
  [
    'Receipt',
    'receipt',
    'Received payment ILS 118.00 by cash for a prior service. This is confirmation of payment.',
  ],
  [
    'Tax Invoice / Receipt',
    'tax_invoice_receipt',
    'Goods supplied and payment received in cash. Net ILS 100.00; VAT ILS 18.00; Total ILS 118.00.',
  ],
  [
    'Insurance Policy',
    'insurance_policy',
    'Business property insurance coverage, policy DEV-POLICY. Annual premium ILS 400.00. Coverage 20 November 2026 to 19 November 2027. No VAT stated.',
  ],
  [
    'Vehicle Licensing Fee',
    'license_fee',
    'Vehicle registration renewal fee. Annual government licensing charge ILS 250.00 for the sample vehicle DEV-123. No VAT stated.',
  ],
  [
    'Credit Tax Invoice',
    'credit_invoice',
    'Credit note for returned goods, referencing sample invoice DEV-01. Credit: net ILS 100.00; VAT ILS 18.00; total credit ILS 118.00.',
  ],
].map(([title, type, body], i) => ({
  title,
  expectedType: type,
  body:
    'Sample supplier: DEV Demo Supplier. Customer: DEV Nagrut. Document date: 20 November 2026. Document number DEV-' +
    (i + 1) +
    '.\n' +
    body,
}));
async function baseline() {
  return db.query(
    "SELECT id,SHA2(CONCAT_WS('|',COALESCE(drive_file_id,''),email_work_state,email_ai_state,COALESCE(email_ai_attempt_id,''),COALESCE(email_claim_id,''),COALESCE(email_decision,''),COALESCE(email_deleted_at,'')),256) AS signature FROM imported_documents ORDER BY id",
  );
}
async function guardFixture(c) {
  const w = await service(classes.EmailIntakeStore).work(
    c.id,
    manifest.owner,
    manifest.businessNumber,
  );
  assert.ok(w, 'fixture ledger row');
  assert.equal(w.email_run_id, manifest.runId);
  assert.equal(w.content_hash, c.hash);
  assert.equal(w.business_number, manifest.businessNumber);
  assert.equal(w.firebase_id, manifest.owner);
  if (w.email_work_state !== 'DELETED')
    assert.ok(w.filename.startsWith(manifest.op + '-'));
  return w;
}
async function stage(ctx) {
  manifest = {
    op: 'kit-e2e-' + crypto.randomUUID(),
    runId: crypto.randomUUID(),
    owner: ctx.account.firebase_id,
    businessNumber: ctx.business.businessNumber,
    businessId: 5,
    created: new Date().toISOString(),
    cases: [],
    aiCalls: 0,
    deleteCalls: 0,
    before: await baseline(),
  };
  save();
  await db.query(
    "INSERT INTO email_import_runs (id,firebase_id,business_number,integration_id,sync_type,query_text,scan_state,pull_state,processing_state) VALUES (?,?,?,?,? ,?,'DONE','COMPLETE','WAITING')",
    [
      manifest.runId,
      manifest.owner,
      manifest.businessNumber,
      17,
      'MANUAL',
      'DEV_SYNTHETIC_ONLY:' + manifest.op,
    ],
  );
  const positive = await pdf(positivePages),
    negative = await pdf([
      {
        title: 'A walk through a garden',
        body: 'A short fictional reading exercise. Green leaves move in a gentle breeze. The path curves around a pond, where birds gather in the morning. The story ends as the sunlight reaches a wooden bench.',
      },
    ]);
  const uncertain = await pdf([{ title: '', body: '' }]);
  const replacementPage = [
    {
      title: 'Tax Invoice',
      body: 'DEV Demo Supplier. Customer: DEV Nagrut. Date 20 November 2026. Invoice DEV-LOCKED. A sample service. Net ILS 100.00; VAT ILS 18.00; total due ILS 118.00.',
    },
  ];
  const locked = await pdf(replacementPage, {
      userPassword: 'dev-only-test',
      ownerPassword: 'dev-only-owner',
    }),
    open = await pdf(replacementPage);
  const fixtures = [
    ['six-types', positive],
    ['negative', negative],
    ['uncertain', uncertain],
    ['locked', locked],
  ];
  for (const [name, bytes] of fixtures) {
    const c = {
      name,
      hash: hash(bytes),
      filename: manifest.op + '-' + name + '.pdf',
      input: path.join(evidenceRoot, manifest.op + '-' + name + '.pdf'),
      aiCalls: 0,
    };
    fs.writeFileSync(c.input, bytes);
    manifest.cases.push(c);
    save();
    const item = {
      id: crypto.randomUUID(),
      message_id: 'dev-e2e:' + crypto.randomUUID(),
      part_path: 'root.1',
      filename: c.filename,
      mime_type: 'application/pdf',
      source_metadata_json: {
        gmailSubject: 'DEV SYNTHETIC QA ' + manifest.op,
        gmailFrom: 'synthetic@example.invalid',
      },
    };
    const result = await service(classes.EmailIntakeStorage).accept(
      {
        id: manifest.runId,
        firebase_id: manifest.owner,
        business_number: manifest.businessNumber,
        integration_id: 17,
      },
      item,
      bytes,
    );
    assert.equal(result.duplicate, false);
    c.id = result.id;
    const w = await guardFixture(c);
    c.file = w.drive_file_id;
    c.uploadTag = w.email_upload_tag;
    save();
    await db.query(
      "INSERT INTO email_import_items (id,run_id,message_id,part_path,state,filename,mime_type,imported_document_id) VALUES (?,?,?,'root.1','IMPORTED',?,'application/pdf',?)",
      [item.id, manifest.runId, item.message_id, c.filename, c.id],
    );
  }
  manifest.openReplacement = {
    input: path.join(evidenceRoot, manifest.op + '-open.pdf'),
    hash: hash(open),
  };
  fs.writeFileSync(manifest.openReplacement.input, open);
  save();
  console.log(
    JSON.stringify({
      staged: true,
      manifest: path.join(evidenceRoot, manifest.op + '.json'),
      cases: manifest.cases.map((c) => ({ name: c.name, id: c.id })),
    }),
  );
}
async function addSixV2(ctx) {
  assert.ok(!manifest.cases.some((c) => c.name === 'six-types-v2'));
  const bytes = await pdf(
    positivePages.map((page) => ({
      ...page,
      body: page.body + '\nScenario revision: coherent six-type contract.',
    })),
  );
  const c = {
    name: 'six-types-v2',
    hash: hash(bytes),
    filename: manifest.op + '-six-types-v2.pdf',
    input: path.join(evidenceRoot, manifest.op + '-six-types-v2.pdf'),
    aiCalls: 0,
  };
  fs.writeFileSync(c.input, bytes);
  manifest.cases.push(c);
  manifest.contractIssueFound =
    'v1 returned unknown for insurance_policy/license_fee; original result retained';
  save();
  const item = {
    id: crypto.randomUUID(),
    message_id: 'dev-e2e:' + crypto.randomUUID(),
    part_path: 'root.1',
    filename: c.filename,
    mime_type: 'application/pdf',
  };
  const result = await service(classes.EmailIntakeStorage).accept(
    {
      id: manifest.runId,
      firebase_id: manifest.owner,
      business_number: manifest.businessNumber,
      integration_id: 17,
    },
    item,
    bytes,
  );
  assert.equal(result.duplicate, false);
  c.id = result.id;
  const w = await guardFixture(c);
  c.file = w.drive_file_id;
  save();
  await db.query(
    "INSERT INTO email_import_items (id,run_id,message_id,part_path,state,filename,mime_type,imported_document_id) VALUES (?,?,?,'root.1','IMPORTED',?,'application/pdf',?)",
    [item.id, manifest.runId, item.message_id, c.filename, c.id],
  );
  console.log(
    JSON.stringify({ newSixTypeFixture: c.id, oldResultPreserved: true }),
  );
}
async function loadManifest(ctx) {
  const op = process.argv[3];
  assert.match(op || '', /^kit-e2e-[a-f0-9-]{36}$/);
  manifest = JSON.parse(fs.readFileSync(path.join(evidenceRoot, op + '.json')));
  assert.equal(manifest.op, op);
  assert.equal(manifest.owner, ctx.account.firebase_id);
  assert.equal(manifest.businessNumber, ctx.business.businessNumber);
  assert.equal(manifest.businessId, 5);
  const [run] = await db.query(
    'SELECT * FROM email_import_runs WHERE id=? AND firebase_id=? AND business_number=?',
    [manifest.runId, manifest.owner, manifest.businessNumber],
  );
  assert.equal(run.query_text, 'DEV_SYNTHETIC_ONLY:' + op);
  assert.equal(run.integration_id, 17);
  assert.equal(run.sync_type, 'MANUAL');
  for (const c of manifest.cases) {
    assert.equal(hash(fs.readFileSync(c.input)), c.hash);
    await guardFixture(c);
  }
}
async function workerFor(ctx) {
  process.env.GMAIL_DURABLE_PROCESS_ENABLED = 'true'; // This CLI process only; never writes .env or starts a scheduler.
  process.env.GMAIL_DURABLE_DELETE_ENABLED = 'false';
  const worker = service(classes.EmailProcessingWorker);
  worker.tick = () => {
    throw Error('Global processing tick is forbidden in the fixture harness');
  };
  const extract = ctx.docs.extractEmailWork.bind(ctx.docs);
  ctx.docs.extractEmailWork = async (w, context) => {
    const c = manifest.cases.find((c) => c.id === w.id);
    assert.ok(c);
    await guardFixture(c);
    assert.ok(manifest.aiCalls < 6, 'bounded paid-call budget');
    manifest.aiCalls++;
    c.aiCalls++;
    save();
    return extract(w, context);
  };
  const drive = service(classes.GoogleDriveService),
    remove = drive.deleteIntakeFile.bind(drive);
  drive.deleteIntakeFile = async (id) => {
    const c = manifest.cases.find(
      (c) => c.name === (manifest.deletionTarget || 'negative'),
    );
    assert.ok(c);
    assert.equal(id, c.file);
    const w = await guardFixture(c);
    assert.equal(w.email_decision, 'NOT_ACCOUNTING');
    assert.equal(hash(await drive.downloadFile(id)), c.hash);
    manifest.deleteCalls++;
    save();
    return remove(id);
  };
  return worker;
}
async function processCases(ctx, fault) {
  const worker = await workerFor(ctx),
    persist = ctx.docs.persistEmailWork.bind(ctx.docs);
  let injected = false;
  if (fault)
    ctx.docs.persistEmailWork = async (w, ...args) => {
      if (w.id === manifest.cases[0].id && !injected) {
        injected = true;
        throw Error('synthetic interruption after saved AI result');
      }
      return persist(w, ...args);
    };
  for (const c of manifest.cases) {
    const w = await guardFixture(c);
    if (c.name === 'six-types' && w.email_work_state === 'RESULT_SAVED') {
      fs.writeFileSync(
        path.join(evidenceRoot, manifest.op + '-initial-v1-result.json'),
        JSON.stringify(w.email_result_json, null, 2),
      );
    }
    if (
      c.name === 'locked' ||
      [
        'AWAITING_APPROVAL',
        'DELETED',
        'DELETE_BLOCKED',
        'DELETE_PENDING',
      ].includes(w.email_work_state)
    )
      continue;
    assert.ok(
      ['MOVE_PENDING', 'READY', 'RESULT_SAVED', 'AI_PREPARED'].includes(
        w.email_work_state,
      ),
      'known resumable fixture state',
    );
    if (c.name === 'six-types-v2') {
      const second = new classes.EmailProcessingWorker(
        service(classes.EmailIntakeStore),
        ctx.docs,
        service(classes.GoogleDriveService),
        db.getRepository('Business'),
      );
      await Promise.all([worker.runOne({ ...w }), second.runOne({ ...w })]);
      manifest.concurrentClaimTest = true;
    } else await worker.runOne(w);
    const after = await guardFixture(c);
    c.lastState = after.email_work_state;
    c.decision = after.email_decision;
    c.error = after.email_error_code;
    if (fault) {
      assert.equal(after.email_work_state, 'RESULT_SAVED');
      assert.equal(c.aiCalls, 1);
      manifest.savedResultInterruption = true;
      save();
      break;
    }
    assert.ok(
      ['AWAITING_APPROVAL', 'DELETE_PENDING'].includes(after.email_work_state),
      'fixture processing must complete: ' +
        c.name +
        '/' +
        after.email_work_state,
    );
    save();
  }
  console.log(
    JSON.stringify({
      processed: true,
      paidCalls: manifest.aiCalls,
      cases: manifest.cases.map((c) => ({
        name: c.name,
        id: c.id,
        decision: c.decision,
        state: c.lastState,
        aiCalls: c.aiCalls,
      })),
    }),
  );
}
async function replace(ctx) {
  const c = manifest.cases.find((c) => c.name === 'locked'),
    w = await guardFixture(c);
  assert.equal(w.email_work_state, 'PASSWORD_REQUIRED');
  const [root] = await db.query(
    'SELECT * FROM protected_documents WHERE original_import_id=? AND firebase_id=? AND business_number=?',
    [c.id, manifest.owner, manifest.businessNumber],
  );
  assert.ok(root);
  const bytes = fs.readFileSync(manifest.openReplacement.input);
  assert.equal(hash(bytes), manifest.openReplacement.hash);
  manifest.replacementKey = manifest.replacementKey || crypto.randomUUID();
  save();
  const servicePdf = service(classes.ProtectedPdfService),
    file = {
      buffer: bytes,
      originalname: manifest.op + '-replacement.pdf',
      mimetype: 'application/pdf',
    };
  await servicePdf.replace(
    manifest.owner,
    manifest.owner,
    manifest.businessNumber,
    root.id,
    manifest.replacementKey,
    true,
    file,
  );
  const [op] = await db.query(
    'SELECT * FROM document_replacement_operations WHERE protected_id=? AND idempotency_key=?',
    [root.id, manifest.replacementKey],
  );
  assert.ok(op?.replacement_import_id);
  const record = {
    name: 'replacement',
    id: op.replacement_import_id,
    hash: manifest.openReplacement.hash,
    filename: file.originalname,
    input: manifest.openReplacement.input,
    file: op.candidate_drive_id,
    aiCalls: 0,
  };
  manifest.cases.push(record);
  manifest.protectedRoot = root.id;
  manifest.replacementOperation = op.id;
  save();
  process.env.PROTECTED_PDF_DISPATCH_ENABLED = 'true';
  await service(classes.ProtectedPdfWorker).deliver(op.id);
  process.env.PROTECTED_PDF_DISPATCH_ENABLED = 'false';
  assert.equal((await guardFixture(record)).email_work_state, 'READY');
  assert.equal((await guardFixture(c)).email_work_state, 'REPLACED');
  const countBefore = manifest.cases.length;
  await servicePdf.replace(
    manifest.owner,
    manifest.owner,
    manifest.businessNumber,
    root.id,
    manifest.replacementKey,
    true,
    file,
  );
  const [same] = await db.query(
    'SELECT replacement_import_id FROM document_replacement_operations WHERE id=?',
    [op.id],
  );
  assert.equal(same.replacement_import_id, record.id);
  assert.equal(manifest.cases.length, countBefore);
  await service(classes.GoogleDriveService).getIntakeFileMetadata(c.file);
  manifest.originalRetained = true;
  manifest.replacementIdempotent = true;
  save();
  console.log(
    JSON.stringify({
      replacementLinked: record.id,
      originalRetained: true,
      idempotent: true,
    }),
  );
}
async function removeNegative(ctx, target = 'negative') {
  manifest.deletionTarget = target;
  save();
  const beforeDeletes = manifest.deleteCalls;
  const worker = await workerFor(ctx),
    c = manifest.cases.find((c) => c.name === target);
  let w = await guardFixture(c);
  assert.equal(w.email_work_state, 'DELETE_PENDING');
  assert.equal(w.email_decision, 'NOT_ACCOUNTING');
  const repo = db.getRepository('ExtractedDocument'),
    claim = await repo.findOneBy({ id: w.email_claim_id });
  assert.ok(claim);
  assert.equal(claim.driveFileId, c.file);
  const { id, createdAt, updatedAt, ...shared } = claim;
  const extra = await repo.save(
    repo.create({ ...shared, subIndex: 1, rawResponse: null }),
  );
  manifest.syntheticSharedReference = extra.id;
  save();
  process.env.GMAIL_DURABLE_DELETE_ENABLED = 'true';
  await worker.runOne(w);
  w = await guardFixture(c);
  assert.equal(w.email_work_state, 'DELETE_BLOCKED');
  assert.equal(manifest.deleteCalls, beforeDeletes);
  await service(classes.GoogleDriveService).getIntakeFileMetadata(c.file);
  manifest.sharedReferenceBlocked = true;
  save();
  // Remove ONLY the newly created test reference, then retry the already valid negative decision.
  assert.equal(extra.driveFileId, c.file);
  assert.equal(extra.userId, claim.userId);
  await repo.delete({ id: extra.id, driveFileId: c.file });
  if (target === 'negative-v2') {
    await db.query(
      "UPDATE imported_documents SET email_work_state='DELETE_PENDING' WHERE id=? AND email_work_state='DELETE_BLOCKED' AND email_decision='NOT_ACCOUNTING'",
      [c.id],
    );
    const original = fs.readFileSync(c.input),
      changed = fs.readFileSync(
        manifest.cases.find((x) => x.name === 'six-types-v2').input,
      );
    const drive = service(classes.GoogleDriveService),
      client = drive.getSystemDrive();
    manifest.contentChangeProbe = { id: c.id, restored: false };
    save();
    await client.files.update(
      {
        fileId: c.file,
        media: {
          mimeType: 'application/pdf',
          body: require('stream').Readable.from(changed),
        },
        supportsAllDrives: true,
        fields: 'id',
      },
      { timeout: 30000, retry: false },
    );
    await worker.runOne(await guardFixture(c));
    const blocked = await guardFixture(c);
    assert.equal(blocked.email_work_state, 'DELETE_BLOCKED');
    assert.equal(blocked.email_error_code, 'CONTENT_CHANGED');
    assert.equal(manifest.deleteCalls, beforeDeletes);
    await client.files.update(
      {
        fileId: c.file,
        media: {
          mimeType: 'application/pdf',
          body: require('stream').Readable.from(original),
        },
        supportsAllDrives: true,
        fields: 'id',
      },
      { timeout: 30000, retry: false },
    );
    assert.equal(hash(await drive.downloadFile(c.file)), c.hash);
    manifest.contentChangeProbe.restored = true;
    manifest.changedContentBlocked = true;
    save();
  }

  await db.query(
    "UPDATE imported_documents SET email_work_state='DELETE_PENDING' WHERE id=? AND firebase_id=? AND business_number=? AND email_work_state='DELETE_BLOCKED' AND email_decision='NOT_ACCOUNTING'",
    [c.id, manifest.owner, manifest.businessNumber],
  );
  await worker.runOne(await guardFixture(c));
  w = await guardFixture(c);
  assert.equal(w.email_work_state, 'DELETED');
  assert.ok(w.email_deleted_at);
  assert.equal(w.drive_file_id, null);
  assert.equal(w.email_result_json, null);
  assert.equal(manifest.deleteCalls, beforeDeletes + 1);
  let absent = false;
  try {
    await service(classes.GoogleDriveService).getIntakeFileMetadata(c.file);
  } catch (e) {
    absent = Number(e.code || e.response?.status) === 404;
  }
  assert.equal(absent, true);
  const duplicate = await service(classes.EmailIntakeStorage).accept(
    {
      id: manifest.runId,
      firebase_id: manifest.owner,
      business_number: manifest.businessNumber,
      integration_id: 17,
    },
    {
      filename: c.filename,
      mime_type: 'application/pdf',
      message_id: 'dev-e2e-dedup',
    },
    fs.readFileSync(c.input),
  );
  assert.equal(duplicate.id, c.id);
  assert.equal(duplicate.duplicate, true);
  manifest.tombstoneDedup = true;
  c.lastState = 'DELETED';
  save();
  console.log(
    JSON.stringify({
      deletedOnlyArtificialNegative: true,
      physicalAbsenceConfirmed: true,
      sharedReferenceGuard: true,
      tombstoneDedup: true,
      deleteCalls: manifest.deleteCalls,
    }),
  );
}
async function addNegativeV2(ctx) {
  assert.ok(!manifest.cases.some((c) => c.name === 'negative-v2'));
  const bytes = await pdf([
    {
      title: 'A fictional forest walk',
      body: 'A small bird rests on a branch while green leaves move in the breeze. A narrow path leads to a quiet pond. The visitor watches the water and returns home. QA content-identity case.',
    },
  ]);
  const c = {
    name: 'negative-v2',
    hash: hash(bytes),
    filename: manifest.op + '-negative-v2.pdf',
    input: path.join(evidenceRoot, manifest.op + '-negative-v2.pdf'),
    aiCalls: 0,
  };
  fs.writeFileSync(c.input, bytes);
  manifest.cases.push(c);
  save();
  const item = {
    id: crypto.randomUUID(),
    message_id: 'dev-e2e:' + crypto.randomUUID(),
    part_path: 'root.1',
    filename: c.filename,
    mime_type: 'application/pdf',
  };
  const result = await service(classes.EmailIntakeStorage).accept(
    {
      id: manifest.runId,
      firebase_id: manifest.owner,
      business_number: manifest.businessNumber,
      integration_id: 17,
    },
    item,
    bytes,
  );
  assert.equal(result.duplicate, false);
  c.id = result.id;
  c.file = (await guardFixture(c)).drive_file_id;
  save();
  await db.query(
    "INSERT INTO email_import_items (id,run_id,message_id,part_path,state,filename,mime_type,imported_document_id) VALUES (?,?,?,'root.1','IMPORTED',?,'application/pdf',?)",
    [item.id, manifest.runId, item.message_id, c.filename, c.id],
  );
  console.log(JSON.stringify({ newNegativeFixture: c.id }));
}
async function reconcile(ctx) {
  const store = service(classes.ProtectedPdfStore),
    query = store.query.bind(store);
  store.query = async (sql, params, manager) => {
    const result = await query(sql, params, manager);
    return sql.startsWith(
      'SELECT * FROM document_replacement_operations WHERE status=',
    )
      ? result.filter((row) => row.id === manifest.replacementOperation)
      : result;
  };
  process.env.PROTECTED_PDF_DISPATCH_ENABLED = 'true';
  await service(classes.ProtectedPdfWorker).reconcile();
  process.env.PROTECTED_PDF_DISPATCH_ENABLED = 'false';
  const [op] = await db.query(
    'SELECT processing_status FROM document_replacement_operations WHERE id=? AND firebase_id=? AND business_number=?',
    [manifest.replacementOperation, manifest.owner, manifest.businessNumber],
  );
  assert.equal(op.processing_status, 'SUCCEEDED');
  manifest.replacementReconciled = true;
  save();
  console.log(JSON.stringify({ replacementReconciled: true }));
}
async function gmailProbe(ctx) {
  assert.equal(config.COMPOSIO_ENVIRONMENT, 'dev');
  const integration = await db
    .getRepository('UserIntegration')
    .findOneBy({ id: 17, firebaseId: manifest.owner });
  assert.ok(integration);
  const original = await db.getRepository('ImportedDocument').findOneBy({
    id: 201,
    firebaseId: manifest.owner,
    businessNumber: manifest.businessNumber,
  });
  assert.ok(original);
  assert.match(original.gmailSubject, /^KEEPINTAX-DEV-PUL{1,2}$/);
  const reader = service(classes.GmailReaderService),
    page = await reader.durablePage(
      integration,
      'subject:' +
        JSON.stringify(original.gmailSubject) +
        ' filename:"keepintax-dev-pull.pdf"',
    );
  console.log(JSON.stringify({ exactSyntheticSearchMatches: page.ids.length }));
  assert.ok(
    page.ids.length > 0 && page.ids.length <= 5,
    'bounded exact synthetic Gmail probe',
  );
  assert.ok(
    process.env.KEEPINTAX_QA_ORIGINAL_PDF,
    'explicit synthetic original path required',
  );
  const expected = fs.readFileSync(process.env.KEEPINTAX_QA_ORIGINAL_PDF);
  let matched = 0;
  for (const message of page.ids) {
    const parts = await reader.durableParts(integration, message);
    for (const part of parts.filter(
      (p) => p.filename === 'keepintax-dev-pull.pdf',
    )) {
      const bytes = await reader.durableDownload(
        integration,
        message,
        part.path,
      );
      assert.equal(hash(bytes), hash(expected));
      const existing = await db.getRepository('ImportedDocument').findOneBy({
        firebaseId: manifest.owner,
        businessNumber: manifest.businessNumber,
        contentHash: hash(bytes),
      });
      assert.ok(
        existing,
        'pre-existing synthetic original must exist; do not create another',
      );
      const result = await service(classes.EmailIntakeStorage).accept(
        {
          id: manifest.runId,
          firebase_id: manifest.owner,
          business_number: manifest.businessNumber,
          integration_id: 17,
        },
        {
          filename: part.filename,
          mime_type: 'application/pdf',
          message_id: message,
        },
        bytes,
      );
      assert.equal(result.id, existing.id);
      assert.equal(result.duplicate, true);
      matched++;
    }
  }
  assert.ok(matched > 0);
  manifest.gmailReadAndDedup = {
    matched,
    exactContent: true,
    noNewImport: true,
  };
  save();
  console.log(
    JSON.stringify({
      realComposioSearchReadDownload: true,
      exactSyntheticMatches: matched,
      existingContentDeduplicated: true,
      createdImport: false,
    }),
  );
}
async function addImage(ctx) {
  assert.ok(!manifest.cases.some((c) => c.name === 'image'));
  const svg =
    '<svg width="1000" height="1200" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="1200" fill="white"/><g font-family="Arial,sans-serif" fill="black"><text x="70" y="80" font-size="22">DEV QA - Fictitious sample</text><text x="70" y="180" font-size="48">Tax Invoice</text><text x="70" y="260" font-size="28">Supplier: DEV Demo Supplier</text><text x="70" y="320" font-size="28">Customer: DEV Nagrut</text><text x="70" y="380" font-size="28">Date: 20 November 2026</text><text x="70" y="440" font-size="28">Invoice number: DEV-IMAGE-01</text><text x="70" y="580" font-size="28">Sample service: ILS 100.00</text><text x="70" y="650" font-size="28">VAT: ILS 18.00</text><text x="70" y="760" font-size="38">Total due: ILS 118.00</text></g></svg>';
  const bytes = await require('sharp')(Buffer.from(svg)).png().toBuffer();
  const c = {
    name: 'image',
    hash: hash(bytes),
    filename: manifest.op + '-image.png',
    input: path.join(evidenceRoot, manifest.op + '-image.png'),
    aiCalls: 0,
  };
  fs.writeFileSync(c.input, bytes);
  manifest.cases.push(c);
  save();
  const item = {
    id: crypto.randomUUID(),
    message_id: 'dev-e2e:' + crypto.randomUUID(),
    part_path: 'root.1',
    filename: c.filename,
    mime_type: 'image/png',
  };
  const result = await service(classes.EmailIntakeStorage).accept(
    {
      id: manifest.runId,
      firebase_id: manifest.owner,
      business_number: manifest.businessNumber,
      integration_id: 17,
    },
    item,
    bytes,
  );
  assert.equal(result.duplicate, false);
  c.id = result.id;
  c.file = (await guardFixture(c)).drive_file_id;
  save();
  await db.query(
    "INSERT INTO email_import_items (id,run_id,message_id,part_path,state,filename,mime_type,imported_document_id) VALUES (?,?,?,'root.1','IMPORTED',?,'image/png',?)",
    [item.id, manifest.runId, item.message_id, c.filename, c.id],
  );
  console.log(JSON.stringify({ newSyntheticImage: c.id }));
}
async function verify(ctx) {
  const rows = await baseline(),
    old = new Map(manifest.before.map((r) => [r.id, r.signature]));
  const changed = rows.filter(
    (r) => old.has(r.id) && old.get(r.id) !== r.signature,
  );
  assert.equal(changed.length, 0, 'pre-existing imports must remain unchanged');
  const sample = await guardFixture(
    manifest.cases.find((c) => c.name === 'six-types-v2'),
  );
  await assert.rejects(
    () =>
      ctx.docs.prepareEmailWork(
        { ...sample, firebase_id: 'dev-e2e-unowned-' + crypto.randomUUID() },
        'none',
      ),
    (e) => e.getStatus?.() === 403,
  );
  await assert.rejects(
    () =>
      service(classes.ProtectedPdfService).replace(
        'dev-e2e-unowned-' + crypto.randomUUID(),
        manifest.owner,
        manifest.businessNumber,
        manifest.protectedRoot,
        crypto.randomUUID(),
        true,
        {
          buffer: fs.readFileSync(manifest.openReplacement.input),
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
        },
      ),
    (e) => e.getStatus?.() === 404,
  );
  manifest.crossUserAccessRejected = true;
  const archive = await ctx.docs.getArchivedForUser(
      manifest.owner,
      manifest.businessNumber,
      true,
    ),
    result = [];
  for (const c of manifest.cases) {
    const w = await guardFixture(c);
    const extracted = await db
      .getRepository('ExtractedDocument')
      .find({ where: { driveFileId: c.file }, order: { subIndex: 'ASC' } });
    assert.ok(extracted.every((r) => !r.confirmedExpenseId));
    const visible = archive.filter((r) => r.driveFileId === c.file);
    result.push({
      name: c.name,
      id: c.id,
      state: w.email_work_state,
      decision: w.email_decision,
      types: extracted.map((r) => r.documentType),
      archiveStatuses: visible.map((r) => r.status),
      visible: visible.length,
      aiCalls: c.aiCalls,
    });
    if (c.name === 'six-types-v2') {
      assert.equal(w.email_decision, 'ACCOUNTING');
      assert.deepEqual(
        [...new Set(extracted.map((r) => r.documentType))].sort(),
        positivePages.map((p) => p.expectedType).sort(),
      );
      assert.ok(
        visible.every((r) => r.status === 'PENDING' || r.status === 'pending'),
      );
      assert.equal(c.aiCalls, 1);
    }
    if (c.name === 'negative' || c.name === 'negative-v2') {
      assert.equal(w.email_work_state, 'DELETED');
      assert.equal(visible.length, 0);
    }
    if (c.name === 'uncertain' || c.name === 'six-types') {
      assert.equal(w.email_decision, 'UNCERTAIN');
      assert.equal(extracted.length, 1);
      assert.equal(extracted[0].amount, null);
      assert.equal(extracted[0].date, null);
      assert.equal(extracted[0].rejectionReason, null);
      assert.equal(visible.length, 1);
      assert.equal(visible[0].canResolve, true);
    }
  }
  const image = result.find((row) => row.name === 'image');
  if (image) {
    assert.equal(image.decision, 'ACCOUNTING');
    assert.deepEqual(image.types, ['invoice']);
    assert.equal(image.visible, 1);
    assert.equal(image.aiCalls, 1);
  }
  const locked = result.find((row) => row.name === 'locked'),
    replacement = result.find((row) => row.name === 'replacement');
  assert.equal(locked.state, 'REPLACED');
  assert.equal(locked.visible, 0);
  assert.equal(replacement.state, 'AWAITING_APPROVAL');
  assert.equal(replacement.visible, 1);
  manifest.verified = result;
  manifest.existingRowsUnchanged = true;
  save();
  console.log(
    JSON.stringify({
      verified: true,
      existingImportsUnchanged: true,
      noAccountingPosting: true,
      result,
    }),
  );
}
async function main() {
  const mode = process.argv[2];
  assert.ok(
    [
      '--inspect',
      '--stage',
      '--interrupt',
      '--process',
      '--replace',
      '--delete',
      '--verify',
      '--add-six-v2',
      '--add-negative-v2',
      '--delete-v2',
      '--reconcile',
      '--gmail-probe',
      '--add-image',
    ].includes(mode),
  );
  const ctx = await inspect();
  if (mode === '--inspect') return;
  scanLock = db.createQueryRunner();
  await scanLock.connect();
  const [lock] = await scanLock.query(
    "SELECT GET_LOCK('gmail-durable-scan',15) AS acquired",
  );
  assert.equal(
    Number(lock.acquired),
    1,
    'hold automatic scanner during bounded test phase',
  );
  if (mode === '--stage') return stage(ctx);
  await loadManifest(ctx);
  if (mode === '--add-image') return addImage(ctx);
  if (mode === '--add-six-v2') return addSixV2(ctx);
  if (mode === '--add-negative-v2') return addNegativeV2(ctx);
  if (mode === '--delete-v2') return removeNegative(ctx, 'negative-v2');
  if (mode === '--reconcile') return reconcile(ctx);
  if (mode === '--gmail-probe') return gmailProbe(ctx);
  if (mode === '--interrupt') return processCases(ctx, true);
  if (mode === '--process') return processCases(ctx, false);
  if (mode === '--replace') return replace(ctx);
  if (mode === '--delete') return removeNegative(ctx);
  if (mode === '--verify') return verify(ctx);
}
main()
  .catch((e) => {
    console.error(
      JSON.stringify({
        failed: true,
        code: e.code || e.name,
        message: String(e.message || '').slice(0, 250),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (scanLock) {
      try {
        await scanLock.query("SELECT RELEASE_LOCK('gmail-durable-scan')");
      } finally {
        await scanLock.release();
      }
    }
    if (db.isInitialized) await db.destroy();
  });
