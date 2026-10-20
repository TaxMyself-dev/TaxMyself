const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto'),
  { execFileSync } = require('child_process'),
  { createRequire } = require('module');
const root = path.resolve(__dirname, '../..'),
  req = createRequire(path.join(root, 'backend/package.json'));
const cfg = req('dotenv').parse(
  fs.readFileSync(path.join(root, 'backend/.env')),
);
if (cfg.DB_DATABASE !== 'keepintax-dev') throw Error('DEV only');
const backupPath = path.join(
  root,
  '.test-tmp/source-records-before-2026-10-20.json',
);
const ignored = {
  source: new Set(['sourceName', 'connectionRole']),
  user_source_sync_state: new Set(['sourceId', 'sourceRecordId']),
  full_transactions_cache: new Set(['paymentIdentifier', 'sourceRecordId']),
  slim_transactions: new Set(),
  transactions: new Set(),
};
function digest(rows, table) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify(
        rows.map((r) =>
          Object.fromEntries(
            Object.entries(r)
              .filter(([k]) => !ignored[table].has(k))
              .sort(([a], [b]) => a.localeCompare(b)),
          ),
        ),
      ),
    )
    .digest('hex');
}
(async () => {
  let db;
  try {
    db = await req('mysql2/promise').createConnection({
      host: cfg.DB_HOST,
      port: +cfg.DB_PORT || 3306,
      user: cfg.DB_USERNAME,
      password: cfg.DB_PASSWORD,
      database: cfg.DB_DATABASE,
      timezone: 'Z',
      multipleStatements: false,
    });
    if ((await db.query('SELECT DATABASE() db'))[0][0].db !== 'keepintax-dev')
      throw Error('Wrong database');
    const tables = Object.keys(ignored),
      rows = {};
    for (const t of tables)
      rows[t] = (await db.query('SELECT * FROM `' + t + '` ORDER BY id'))[0];
    const [columns] = await db.query(
      "SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('connectionRole','sourceRecordId') AND TABLE_NAME IN ('source','user_source_sync_state','full_transactions_cache')",
    );
    const applied = columns.length === 3;
    if (process.argv[2] === 'apply' && !applied) {
      if (columns.length)
        throw Error('Partial migration detected; inspect before continuing');
      if (fs.existsSync(backupPath))
        throw Error('Backup exists; refusing overwrite');
      execFileSync(
        'git',
        [
          '-C',
          root,
          'check-ignore',
          '--quiet',
          '--',
          '.test-tmp/source-records-before-2026-10-20.json',
        ],
        { stdio: 'pipe' },
      );
      const sourceByKey = new Map(
        rows.source.map((s) => [s.userId + '|' + s.sourceName, s]),
      );
      if (
        rows.user_source_sync_state.some(
          (s) => !sourceByKey.has(s.userId + '|' + s.sourceId),
        )
      )
        throw Error('Orphan sync rows');
      if (
        rows.full_transactions_cache.some(
          (c) =>
            c.paymentIdentifier?.endsWith('_spouse') &&
            !sourceByKey.has(c.userId + '|' + c.paymentIdentifier),
        )
      )
        throw Error('Orphan spouse transactions');
      const snapshot = {
        createdAt: new Date().toISOString(),
        database: 'keepintax-dev',
        rows,
      };
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, JSON.stringify(snapshot), { flag: 'wx' });
      console.log(
        'Saved ignored local rollback snapshot of source links and transaction data',
      );
      await db.query('SET SESSION lock_wait_timeout=10');
      const statements = [
        "ALTER TABLE source ADD COLUMN connectionRole enum('primary','spouse') NOT NULL DEFAULT 'primary'",
        'ALTER TABLE user_source_sync_state ADD COLUMN sourceRecordId int NULL',
        'ALTER TABLE full_transactions_cache ADD COLUMN sourceRecordId int NULL',
        'UPDATE user_source_sync_state ss JOIN source s ON s.userId=ss.userId AND s.sourceName=ss.sourceId SET ss.sourceRecordId=s.id',
        'UPDATE full_transactions_cache c JOIN source s ON s.userId=c.userId AND s.sourceName=c.paymentIdentifier SET c.sourceRecordId=s.id',
        'ALTER TABLE source ADD UNIQUE INDEX UQ_source_user_type_name_role (userId,sourceType,sourceName,connectionRole), DROP INDEX IDX_source_userId_sourceName',
        'ALTER TABLE user_source_sync_state ADD UNIQUE INDEX UQ_source_sync_user_record (userId,sourceRecordId), DROP INDEX UQ_source_sync_user_source',
      ];
      for (const q of statements) await db.query(q);
      await db.beginTransaction();
      try {
        await db.query(
          "UPDATE source SET connectionRole=CASE WHEN RIGHT(sourceName,7)='_spouse' THEN 'spouse' ELSE 'primary' END, sourceName=CASE WHEN RIGHT(sourceName,7)='_spouse' THEN LEFT(sourceName,CHAR_LENGTH(sourceName)-7) ELSE sourceName END",
        );
        await db.query(
          'UPDATE user_source_sync_state ss JOIN source s ON s.id=ss.sourceRecordId AND s.userId=ss.userId SET ss.sourceId=s.sourceName',
        );
        await db.query(
          'UPDATE full_transactions_cache c JOIN source s ON s.id=c.sourceRecordId AND s.userId=c.userId SET c.paymentIdentifier=s.sourceName',
        );
        await db.commit();
      } catch (e) {
        await db.rollback();
        throw e;
      }
      await db.query(
        'ALTER TABLE user_source_sync_state MODIFY sourceRecordId int NOT NULL, ADD CONSTRAINT FK_sync_source_record FOREIGN KEY (sourceRecordId) REFERENCES source(id) ON DELETE RESTRICT',
      );
      await db.query(
        'ALTER TABLE full_transactions_cache ADD CONSTRAINT FK_cache_source_record FOREIGN KEY (sourceRecordId) REFERENCES source(id) ON DELETE RESTRICT',
      );
      console.log('Applied source-role migration and foreign keys on DEV');
    }
    if (process.argv[2] === 'apply' || process.argv[2] === 'verify') {
      const before = JSON.parse(fs.readFileSync(backupPath));
      const summary = {};
      for (const t of tables) {
        const after = (
          await db.query('SELECT * FROM `' + t + '` ORDER BY id')
        )[0];
        const preserved =
          after.length === before.rows[t].length &&
          digest(after, t) === digest(before.rows[t], t);
        if (!preserved) throw Error('Unexpected data change in ' + t);
        summary[t] = { rows: after.length, preserved: true };
      }
      const [links] = await db.query(`SELECT
   (SELECT COUNT(*) FROM user_source_sync_state ss LEFT JOIN source s ON s.id=ss.sourceRecordId AND s.userId=ss.userId WHERE s.id IS NULL OR ss.sourceId<>s.sourceName) invalidSyncLinks,
   (SELECT COUNT(*) FROM full_transactions_cache c LEFT JOIN source s ON s.id=c.sourceRecordId AND s.userId=c.userId WHERE c.sourceRecordId IS NOT NULL AND (s.id IS NULL OR c.paymentIdentifier<>s.sourceName)) invalidCacheLinks,
   (SELECT COUNT(*) FROM source WHERE RIGHT(sourceName,7)='_spouse') suffixedSources,
   (SELECT COUNT(*) FROM user_source_sync_state WHERE RIGHT(sourceId,7)='_spouse') suffixedSyncSources,
   (SELECT COUNT(*) FROM full_transactions_cache WHERE RIGHT(paymentIdentifier,7)='_spouse') suffixedPayments,
   (SELECT COUNT(*) FROM source WHERE connectionRole='spouse') spouseSources,
   (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME IN ('FK_sync_source_record','FK_cache_source_record')) foreignKeys`);
      if (
        links[0].invalidSyncLinks ||
        links[0].invalidCacheLinks ||
        links[0].suffixedSources ||
        links[0].suffixedSyncSources ||
        links[0].suffixedPayments ||
        links[0].foreignKeys !== 2
      )
        throw Error('Migration link verification failed');
      console.log(
        JSON.stringify(
          {
            database: 'keepintax-dev',
            preservedTables: summary,
            links: links[0],
          },
          null,
          2,
        ),
      );
    } else
      console.log(
        JSON.stringify({
          applied,
          counts: Object.fromEntries(tables.map((t) => [t, rows[t].length])),
        }),
      );
  } catch (e) {
    console.error(
      JSON.stringify({
        code: e.code || e.name,
        message: e.code ? 'DEV migration operation failed' : e.message,
      }),
    );
    process.exitCode = 1;
  } finally {
    if (db) await db.end();
  }
})();
