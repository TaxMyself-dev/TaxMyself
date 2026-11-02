/* Real MySQL constraint checks, synthetic rows rolled back. Dev only, no providers. */
const fs = require('fs'), path = require('path'), { randomUUID } = require('crypto');
const cfg = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
async function main() {
  if (cfg.DB_DATABASE !== 'keepintax-dev') throw Error('DEV only');
  const c = await require('mysql2/promise').createConnection({ host: cfg.DB_HOST, port: Number(cfg.DB_PORT) || 3306,
    user: cfg.DB_USERNAME, password: cfg.DB_PASSWORD, database: 'keepintax-dev' });
  let assertions = 0;
  async function fails(sql, args, codes) {
    try { await c.execute(sql, args); } catch (e) { if (codes.includes(e.code)) { assertions++; return; } throw e; }
    throw Error('Expected constraint rejection');
  }
  try {
    const [[before]] = await c.query('SELECT (SELECT COUNT(*) FROM billing_attempt) AS attempts, (SELECT COUNT(*) FROM billing_event) AS events');
    await c.beginTransaction();
    const [source] = await c.execute("INSERT INTO billing_event (firebase_id,event_type,amount_agorot) VALUES (?, 'PAYMENT_SUCCESS',100)", ['refund-schema-test-' + randomUUID()]);
    const sql = "INSERT INTO billing_attempt (operation,source_payment_event_id,request_id,requested_by_firebase_id,refund_reason,attempt_number,`trigger`,charge_mode,status,cardcom_external_uniq_tran_id,provider_terminal_ref,cardcom_transaction_id,amount_agorot,amount_before_vat_agorot,vat_amount_agorot) VALUES ('REFUND',?,?,?,?,1,'REFUND','TRANSACTION_REFUND','CAPTURED',?,?,?,100,100,0)";
    const request = randomUUID(); const external = () => randomUUID().replace(/-/g, '').slice(0, 25);
    const providerId = 'schema-test-' + randomUUID();
    const base = [source.insertId, request, 'test-admin', 'Synthetic schema verification', external(), 'schema-test', providerId];
    const [refund] = await c.execute(sql, base);
    assertions++;
    await fails(sql, [source.insertId, request, 'test-admin', 'Synthetic schema verification', external(), 'schema-test', null], ['ER_DUP_ENTRY']);
    await fails(sql, [source.insertId, randomUUID(), 'test-admin', 'Synthetic schema verification', external(), 'schema-test', providerId], ['ER_DUP_ENTRY']);
    await fails(sql, [null, randomUUID(), 'test-admin', 'Synthetic schema verification', external(), 'schema-test', null], ['ER_SIGNAL_EXCEPTION']);
    await fails(sql, [2147483647, randomUUID(), 'test-admin', 'Synthetic schema verification', external(), 'schema-test', null], ['ER_NO_REFERENCED_ROW_2']);
    const eventSql = "INSERT INTO billing_event (firebase_id,event_type,billing_attempt_id,amount_agorot,amount_before_vat_agorot,vat_amount_agorot) VALUES ('refund-schema-test','REFUND_SUCCESS',?,?,?,?)";
    await fails(eventSql, [refund.insertId, 100, 100, 0], ['ER_SIGNAL_EXCEPTION']);
    await c.execute(eventSql, [refund.insertId, -100, -100, 0]); assertions++;
    await fails(eventSql, [refund.insertId, -100, -100, 0], ['ER_DUP_ENTRY']);
    await fails('UPDATE billing_attempt SET obligation_id = NULL, operation = \'CHARGE\' WHERE id = ?', [refund.insertId], ['ER_SIGNAL_EXCEPTION']);
    await c.rollback();
    const [[after]] = await c.query('SELECT (SELECT COUNT(*) FROM billing_attempt) AS attempts, (SELECT COUNT(*) FROM billing_event) AS events');
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Synthetic rows not rolled back');
    console.log(JSON.stringify({ database: 'keepintax-dev', passed: assertions, syntheticRowsRolledBack: true, before, after }));
  } finally { await c.rollback(); await c.end(); }
}
main().catch(e => { console.error(JSON.stringify({ failed: true, code: e.code ?? 'VERIFICATION_FAILED', errno: e.errno })); process.exitCode = 1; });
