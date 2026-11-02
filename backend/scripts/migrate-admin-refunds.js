/* Dev only. Does not load Nest, contact providers, or use environment overrides.
 * node scripts/migrate-admin-refunds.js [--apply]
 * Without --apply this inspects schema only. Credentials never enter output. */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const cfg = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));

async function main() {
  if (cfg.DB_DATABASE !== 'keepintax-dev') throw new Error('REFUSED: only keepintax-dev is authorized');
  const connection = await mysql.createConnection({ host: cfg.DB_HOST, port: Number(cfg.DB_PORT) || 3306,
    user: cfg.DB_USERNAME, password: cfg.DB_PASSWORD, database: 'keepintax-dev', multipleStatements: false });
  try {
    const [[identity]] = await connection.query('SELECT DATABASE() AS db, VERSION() AS version');
    if (identity.db !== 'keepintax-dev') throw new Error('Wrong database');
    const [columns] = await connection.query('SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (\'billing_attempt\',\'billing_event\')');
    const [constraints] = await connection.query('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME IN (\'billing_attempt\',\'billing_event\')');
    const has = name => constraints.some(c => c.CONSTRAINT_NAME === name);
    const col = (table, name) => columns.find(c => c.TABLE_NAME === table && c.COLUMN_NAME === name);
    if (!col('billing_attempt', 'id') || !col('billing_event', 'id')) throw new Error('Billing baseline missing');
    const steps = [];
    const add = (table, name, sql) => { if (!col(table, name)) steps.push(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${sql}`); };
    add('billing_attempt', 'operation', "enum('CHARGE','REFUND') NOT NULL DEFAULT 'CHARGE'");
    add('billing_attempt', 'source_payment_event_id', 'int NULL');
    add('billing_attempt', 'request_id', 'varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL');
    add('billing_attempt', 'requested_by_firebase_id', 'varchar(255) NULL');
    add('billing_attempt', 'refund_reason', 'varchar(500) NULL');
    add('billing_attempt', 'refund_provider_transaction_id', "varchar(128) GENERATED ALWAYS AS (CASE WHEN `operation` = 'REFUND' THEN `cardcom_transaction_id` ELSE NULL END) STORED");
    for (const name of ['obligation_id', 'plan_id']) if (col('billing_attempt', name).IS_NULLABLE !== 'YES')
      steps.push(`ALTER TABLE billing_attempt MODIFY COLUMN \`${name}\` int NULL`);
    function appendEnum(table, name, additions) {
      const type = col(table, name)?.COLUMN_TYPE;
      if (!/^enum\(/i.test(type ?? '')) throw new Error('Unexpected enum baseline');
      const missing = additions.filter(value => !type.includes(`'${value}'`));
      if (missing.length) steps.push(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${name}\` ${type.slice(0, -1)},${missing.map(v => `'${v}'`).join(',')}) NOT NULL`);
    }
    appendEnum('billing_attempt', 'trigger', ['REFUND']);
    appendEnum('billing_attempt', 'charge_mode', ['TRANSACTION_REFUND']);
    appendEnum('billing_event', 'event_type', ['REFUND_REQUESTED', 'REFUND_SUCCESS', 'REFUND_FAILED', 'REFUND_RESOLUTION']);
    add('billing_event', 'refund_success_attempt_id', "int GENERATED ALWAYS AS (CASE WHEN `event_type` = 'REFUND_SUCCESS' THEN `billing_attempt_id` ELSE NULL END) VIRTUAL");
    const defs = [
      ['billing_attempt', 'ux_billing_attempt_request', 'UNIQUE KEY `ux_billing_attempt_request` (`request_id`)'],
      ['billing_attempt', 'ix_billing_attempt_refund_source', 'KEY `ix_billing_attempt_refund_source` (`source_payment_event_id`,`operation`,`status`)'],
      ['billing_attempt', 'ix_billing_attempt_operation_action', 'KEY `ix_billing_attempt_operation_action` (`operation`,`status`,`next_action_at`)'],
      ['billing_attempt', 'ux_billing_attempt_refund_provider', 'UNIQUE KEY `ux_billing_attempt_refund_provider` (`provider_terminal_ref`,`refund_provider_transaction_id`)'],
      ['billing_attempt', 'fk_billing_attempt_refund_source', 'CONSTRAINT `fk_billing_attempt_refund_source` FOREIGN KEY (`source_payment_event_id`) REFERENCES `billing_event` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE'],
      ['billing_attempt', 'ck_billing_attempt_operation', "CONSTRAINT `ck_billing_attempt_operation` CHECK ((`operation` = 'CHARGE' AND `obligation_id` IS NOT NULL AND `plan_id` IS NOT NULL AND `source_payment_event_id` IS NULL AND `trigger` <> 'REFUND' AND `charge_mode` <> 'TRANSACTION_REFUND') OR (`operation` = 'REFUND' AND `obligation_id` IS NULL AND `source_payment_event_id` IS NOT NULL AND `request_id` IS NOT NULL AND `requested_by_firebase_id` IS NOT NULL AND `refund_reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`refund_reason`)) > 0 AND `provider_terminal_ref` IS NOT NULL AND `amount_agorot` > 0 AND `trigger` = 'REFUND' AND `charge_mode` = 'TRANSACTION_REFUND'))"],
      ['billing_event', 'ux_billing_event_refund_success', 'UNIQUE KEY `ux_billing_event_refund_success` (`refund_success_attempt_id`)'],
      ['billing_event', 'ck_billing_event_refund_success', "CONSTRAINT `ck_billing_event_refund_success` CHECK (`event_type` <> 'REFUND_SUCCESS' OR (`billing_attempt_id` IS NOT NULL AND `amount_agorot` IS NOT NULL AND `amount_agorot` < 0 AND `amount_before_vat_agorot` IS NOT NULL AND `amount_before_vat_agorot` <= 0 AND `vat_amount_agorot` IS NOT NULL AND `vat_amount_agorot` <= 0 AND `amount_before_vat_agorot` + `vat_amount_agorot` = `amount_agorot`))"],
    ];
    // Indexes are not all constraints in MySQL's information_schema.
    const [indexes] = await connection.query("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('billing_attempt','billing_event')");
    const [triggers] = await connection.query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()');
    for (const [table, name, definition] of defs) {
      if (definition.includes(' CHECK (')) {
        // MySQL 8.0.37 forbids CHECK on cascading-FK columns (errno 3823).
        // Equivalent row invariants in triggers preserve the existing FK actions.
        const expression = definition.slice(definition.indexOf('CHECK (') + 7, -1).replace(/`([a-z_]+)`/g, 'NEW.`$1`');
        for (const action of ['INSERT', 'UPDATE']) {
          const triggerName = `${name}_${action.toLowerCase()}`;
          if (!triggers.some(t => t.TRIGGER_NAME === triggerName)) steps.push(
            `CREATE TRIGGER \`${triggerName}\` BEFORE ${action} ON \`${table}\` FOR EACH ROW BEGIN IF COALESCE((${expression}), 0) = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${name}'; END IF; END`);
        }
      } else if (!has(name) && !indexes.some(i => i.INDEX_NAME === name)) steps.push(`ALTER TABLE \`${table}\` ADD ${definition}`);
    }
    const [[before]] = await connection.query('SELECT (SELECT COUNT(*) FROM billing_attempt) AS attempts, (SELECT COUNT(*) FROM billing_event) AS events');
    console.log(JSON.stringify({ database: identity.db, version: identity.version, pendingStatements: steps.length, before }));
    if (!process.argv.includes('--apply')) return;
    for (let index = 0; index < steps.length; index++) {
      try { await connection.query(steps[index]); }
      catch (error) { console.error(JSON.stringify({ failedStep: index + 1, code: error.code, errno: error.errno })); throw error; }
    }
    const [[invalid]] = await connection.query("SELECT COUNT(*) AS count FROM billing_attempt WHERE operation = 'CHARGE' AND (obligation_id IS NULL OR plan_id IS NULL)");
    const [[after]] = await connection.query('SELECT (SELECT COUNT(*) FROM billing_attempt) AS attempts, (SELECT COUNT(*) FROM billing_event) AS events');
    if (invalid.count !== 0 || JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Verification failed');
    console.log(JSON.stringify({ appliedStatements: steps.length, after, invalidCharges: invalid.count }));
  } finally { await connection.end(); }
}
main().catch(() => { console.error('Dev refund schema operation failed; no credentials or data printed. Inspect the guarded script and schema before retrying.'); process.exitCode = 1; });
