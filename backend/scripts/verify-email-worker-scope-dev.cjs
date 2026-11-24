// Synthetic DEV routing acceptance. One transaction, always rolled back; no providers/Nest.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
async function main() {
  if (process.argv.slice(2).join(' ') !== '--rollback-probe')
    throw Error('REFUSED: explicit rollback probe required');
  const cfg = require('dotenv').parse(
    fs.readFileSync(path.join(__dirname, '../.env')),
  );
  require('./apply-email-worker-scope-dev.cjs').assertDevConfig(cfg);
  Object.assign(process.env, cfg, {
    NODE_ENV: 'development',
    EMAIL_WORKER_SCOPE: 'local',
  });
  const db = await require('mysql2/promise').createConnection({
    host: cfg.DB_HOST,
    port: Number(cfg.DB_PORT || 3306),
    user: cfg.DB_USERNAME,
    password: cfg.DB_PASSWORD,
    database: 'keepintax-dev',
    multipleStatements: false,
    connectTimeout: 10000,
  });
  let held = false,
    transaction = false;
  const runIds = [],
    documentIds = [],
    rootIds = [],
    operationIds = [],
    jobIds = [];
  const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
  const query = async (sql, params = []) => {
    const [rows] = await db.query(sql, params);
    return rows;
  };
  const adapter = { query, transaction: (fn) => fn({ query }) };
  try {
    const [identity] = await query('SELECT DATABASE() AS db');
    if (identity.db !== 'keepintax-dev')
      throw Error('REFUSED: exact DEV required');
    const [lock] = await query(
      "SELECT GET_LOCK('gmail-durable-scan',5) AS acquired",
    );
    if (Number(lock.acquired) !== 1) throw Error('REFUSED: scanner busy');
    held = true;
    const [pending] = await query(
      "SELECT COUNT(*) count FROM email_import_runs WHERE pull_state IN ('RUNNING','RETRY')",
    );
    if (Number(pending.count) !== 0)
      throw Error(
        'REFUSED: existing active pulls; synthetic fixture requires an idle queue',
      );
    const [account] = await query(
      "SELECT u.id,u.firebase_id,r.business_number FROM user_integrations u JOIN email_import_runs r ON r.integration_id=u.id AND r.firebase_id=u.firebase_id WHERE u.provider='MICROSOFT' AND u.status='ACTIVE' ORDER BY r.started_at DESC LIMIT 1",
    );
    if (!account)
      throw Error('REFUSED: existing active DEV Outlook fixture required');
    await query('SET SESSION innodb_lock_wait_timeout=5');
    await db.beginTransaction();
    transaction = true;
    const {
      EmailIntakeStore,
    } = require('../dist/email-intake/email-intake.store');
    const {
      DocumentAiStore,
    } = require('../dist/document-ai/document-ai.store');
    const predicates = require('../dist/email-intake/email-worker-scope');
    const local = new EmailIntakeStore(adapter);
    await local.onModuleInit();
    const input = {
      owner: account.firebase_id,
      business: account.business_number,
      integrationId: account.id,
      query: 'has:attachment after:4070908800',
      type: 'MANUAL',
    };
    const localId = await local.createRun(input);
    runIds.push(localId);
    process.env.EMAIL_WORKER_SCOPE = 'test';
    const test = new EmailIntakeStore(adapter);
    await assert.rejects(test.createRun(input), /another worker scope/);
    for (const scope of ['test', null]) {
      const id = randomUUID();
      runIds.push(id);
      await query(
        "INSERT INTO email_import_runs (id,firebase_id,business_number,integration_id,sync_type,query_text,worker_scope) VALUES (?,?,?,?,'MANUAL','has:attachment after:4070908800',?)",
        [id, input.owner, input.business, input.integrationId, scope],
      );
    }
    const testId = runIds[1];
    const localRuns = await local.runs(input.owner),
      testRuns = await test.runs(input.owner);
    assert.ok(localRuns.some((r) => r.id === localId));
    assert.ok(!localRuns.some((r) => runIds.slice(1).includes(r.id)));
    assert.ok(testRuns.some((r) => r.id === testId));
    assert.ok(!testRuns.some((r) => r.id === localId || r.id === runIds[2]));
    assert.equal(await local.leaseRun(testId), null);
    assert.equal(await test.leaseRun(localId), null);
    assert.ok(await local.leaseRun(localId));
    for (const id of runIds) {
      const result = await query(
        "INSERT INTO imported_documents (firebase_id,business_number,source,content_hash,filename,mime_type,size,email_work_state,email_run_id) VALUES (?,?,'GMAIL',?,'scope-fixture.pdf','application/pdf',1,'READY',?)",
        [input.owner, input.business, hash(), id],
      );
      documentIds.push(result.insertId);
    }
    const localDue = await local.dueWork(),
      testDue = await test.dueWork();
    assert.deepEqual(
      localDue.filter((w) => documentIds.includes(w.id)).map((w) => w.id),
      [documentIds[0]],
    );
    assert.deepEqual(
      testDue.filter((w) => documentIds.includes(w.id)).map((w) => w.id),
      [documentIds[1]],
    );
    assert.equal(
      await local.claimWork(testDue.find((w) => w.id === documentIds[1])),
      null,
    );
    assert.ok(
      await local.claimWork(localDue.find((w) => w.id === documentIds[0])),
    );
    const profile = {
      provider: 'scope_probe',
      model: 'synthetic',
      key: 'scope-probe-' + randomUUID(),
      concurrency: 2,
      rpm: 1,
      itpm: 1,
      otpm: 1,
      pdfPageTokens: 1,
      imageTokens: 1,
      outputEstimate: 1,
    };
    process.env.EMAIL_WORKER_SCOPE = 'local';
    const localAi = new DocumentAiStore(adapter);
    process.env.EMAIL_WORKER_SCOPE = 'test';
    const testAi = new DocumentAiStore(adapter);
    for (const id of documentIds) {
      const job = await localAi.enqueue(
        {
          owner: input.owner,
          business: input.business,
          purpose: 'GMAIL',
          source: 'GMAIL',
          hash: hash(),
          filename: 'scope-fixture.pdf',
          mimeType: 'application/pdf',
          size: 1,
          policy: 'scope-probe',
          context: { importId: id },
          contextKey: randomUUID(),
          fileId: 'synthetic-no-provider-file',
        },
        profile,
      );
      jobIds.push(job.id);
    }
    assert.equal((await localAi.claimNext(profile))?.id, jobIds[0]);
    assert.equal((await testAi.claimNext(profile))?.id, jobIds[1]);
    await query(
      "UPDATE document_processing_jobs SET state='RESULT_SAVED',lease_token=NULL,lease_expires_at=NULL WHERE id IN (?,?,?)",
      jobIds,
    );
    assert.equal((await localAi.claimCompletion(profile))?.id, jobIds[0]);
    assert.equal((await testAi.claimCompletion(profile))?.id, jobIds[1]);
    // Query compilation for stale-lease recovery includes the scoped correlated UPDATEs.
    await localAi.recoverExpired();
    await localAi.unfinishedUploads();
    await localAi.unreportedGmailFailures();
    for (let i = 0; i < runIds.length; i++) {
      const result = await query(
        "INSERT INTO protected_documents (firebase_id,business_number,content_hash,filename,source,metadata_json,integration_id,status,original_import_id) VALUES (?,?,?,'scope-fixture.pdf','GMAIL',?,?,'IMPORTING',?)",
        [
          input.owner,
          input.business,
          hash(),
          JSON.stringify({ emailRunId: runIds[i] }),
          input.integrationId,
          i === 0 ? null : documentIds[i],
        ],
      );
      rootIds.push(result.insertId);
      const id = randomUUID();
      operationIds.push(id);
      await query(
        "INSERT INTO document_replacement_operations (id,protected_id,firebase_id,business_number,actor_id,idempotency_key,content_hash,filename,size,status,expected_version) VALUES (?,?,?,?,?,?,?,'scope-fixture.pdf',1,'RESERVED',1)",
        [
          id,
          result.insertId,
          input.owner,
          input.business,
          input.owner,
          randomUUID(),
          hash(),
        ],
      );
    }
    for (const [scope, index] of [
      ['local', 0],
      ['test', 1],
    ]) {
      const root = predicates.emailProtectedRootScope(scope),
        op = predicates.emailProtectedOperationScope(scope);
      const roots = await query(
        'SELECT id FROM protected_documents WHERE id IN (?,?,?)' + root.sql,
        [...rootIds, ...root.params],
      );
      assert.deepEqual(
        roots.map((r) => r.id),
        [rootIds[index]],
      );
      const ops = await query(
        'SELECT id FROM document_replacement_operations WHERE id IN (?,?,?)' +
          op.sql,
        [...operationIds, ...op.params],
      );
      assert.deepEqual(
        ops.map((r) => r.id),
        [operationIds[index]],
      );
      const updated = await query(
        'UPDATE protected_documents SET recovery_attempts=recovery_attempts+1 WHERE id=?' +
          root.sql,
        [rootIds[index], ...root.params],
      );
      assert.equal(updated.affectedRows, 1);
      const foreign = await query(
        'UPDATE document_replacement_operations SET attempts=attempts+1 WHERE id=?' +
          op.sql,
        [operationIds[1 - index], ...op.params],
      );
      assert.equal(foreign.affectedRows, 0);
    }
    await db.rollback();
    transaction = false;
    for (const [table, ids] of [
      ['email_import_runs', runIds],
      ['imported_documents', documentIds],
      ['document_processing_jobs', jobIds],
      ['protected_documents', rootIds],
      ['document_replacement_operations', operationIds],
    ]) {
      const [row] = await query(
        'SELECT COUNT(*) count FROM ' +
          table +
          ' WHERE id IN (' +
          ids.map(() => '?').join(',') +
          ')',
        ids,
      );
      assert.equal(Number(row.count), 0);
    }
    console.log(
      JSON.stringify({
        verified: true,
        database: 'keepintax-dev',
        localTestRunIsolation: true,
        foreignClaimsRejected: true,
        workAndAiIsolation: true,
        protectedDeliveryIsolation: true,
        unscopedWorkExcluded: true,
        allFixturesRolledBack: true,
        providerCalls: 0,
      }),
    );
  } finally {
    if (transaction) await db.rollback();
    if (held)
      await query("SELECT RELEASE_LOCK('gmail-durable-scan')").catch(() => {});
    await db.end();
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      failed: true,
      code: e.code || e.name,
      safeReason: /^REFUSED:/.test(e.message) ? e.message : undefined,
    }),
  );
  process.exitCode = 1;
});
