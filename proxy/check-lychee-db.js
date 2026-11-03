// Read-only diagnostics. Uses only explicit LYCHEE_DB_* variables; never loads backend environments.
const { databaseOptions } = require('./lychee-routing-store');

async function check() {
  const pool = require('mysql2/promise').createPool(databaseOptions(process.env));
  try {
    const [rows] = await pool.query({ sql: 'SELECT DATABASE() AS db', timeout: 5000 });
    if (rows[0]?.db !== 'keepintax-dev') throw new Error('Database mismatch');
    await pool.query({ sql: `SELECT event_id, channel_id, message_id, sender_phone,
      payload, payload_hash, status FROM lychee_intake_events LIMIT 0`, timeout: 5000 });
    console.log('Development database connection and routing table read access verified. INSERT permission was not tested.');
  } finally { await pool.end(); }
}
if (require.main === module) check().catch(error => {
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CHECK_FAILED';
  console.error('Development database check failed: ' + code + '; credentials and raw errors omitted.');
  process.exitCode = 1;
});
module.exports = { check };
