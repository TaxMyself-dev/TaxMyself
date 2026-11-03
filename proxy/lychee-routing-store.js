const { createHash } = require('node:crypto');

function databaseOptions(env) {
  const invalid = message => { throw Object.assign(new Error(message), { code: 'LYCHEE_DB_CONFIG' }); };
  // This adapter is explicitly for development storage; never inherit backend/prod DB variables.
  if (env.LYCHEE_DB_NAME !== 'keepintax-dev') invalid('Lychee routing requires keepintax-dev');
  for (const name of ['LYCHEE_DB_HOST', 'LYCHEE_DB_USER', 'LYCHEE_DB_PASSWORD']) {
    if (!env[name]) invalid('Lychee routing database configuration incomplete');
  }
  const port = Number(env.LYCHEE_DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid('Invalid Lychee database port');
  const tls = env.LYCHEE_DB_SSL || 'true';
  if (!['true', 'false'].includes(tls)) invalid('Invalid Lychee database TLS setting');
  return {
    host: env.LYCHEE_DB_HOST, port, user: env.LYCHEE_DB_USER,
    password: env.LYCHEE_DB_PASSWORD, database: 'keepintax-dev',
    connectionLimit: 3, waitForConnections: false, connectTimeout: 5000,
    multipleStatements: false, timezone: 'Z',
    ...(tls === 'true' ? { ssl: { rejectUnauthorized: true,
      ...(env.LYCHEE_DB_SSL_CA ? { ca: env.LYCHEE_DB_SSL_CA } : {}) } } : {}),
  };
}

function routingCommand(event) {
  if (event.has_media || event.message_type !== 'text' || event.reply_to_whatsapp_message_id) return null;
  const text = event.text.trim().replace(/\s+/g, ' ');
  return text === 'בדיקות' ? 'dev' : text === 'סיום בדיקות' ? 'prod' : null;
}

function createRoutingStore(env, testPhones, poolFactory) {
  let pool;
  function getPool() {
    if (!pool) pool = (poolFactory || require('mysql2/promise').createPool)(databaseOptions(env));
    return pool;
  }
  return {
    async replyRoute(event, sender) {
      if (!testPhones.has(sender) || event.channel_id !== env.LYCHEE_CHANNEL_ID) throw new Error('Unauthorized routing sender or channel');
      const reply = event.reply_to_whatsapp_message_id;
      if (typeof reply !== 'string' || !reply || reply.length > 255) throw new Error('Invalid reply identifier');
      const timestamp = typeof event.occurred_at === 'string' ? Date.parse(event.occurred_at) : NaN;
      if (!Number.isFinite(timestamp)) throw new Error('Event timestamp required');
      const pool = getPool();
      const [owners] = await pool.query({ sql: `SELECT event_id FROM lychee_intake_events
        WHERE channel_id=? AND sender_phone=? AND prompt_whatsapp_message_id=? LIMIT 2`, timeout: 5000 },
        [event.channel_id, sender, reply]);
      if (owners.length > 1) throw new Error('Ambiguous development prompt ownership');
      if (owners.length === 1) return 'dev';
      const [commands] = await pool.query({ sql: `SELECT DISTINCT status,
        JSON_UNQUOTE(JSON_EXTRACT(payload, '$.occurred_at')) AS occurred_at
        FROM lychee_intake_events WHERE channel_id=? AND sender_phone=?
        AND status IN ('ROUTE_COMMAND_DEV','ROUTE_COMMAND_PROD')
        AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.occurred_at')) <= ?
        ORDER BY occurred_at DESC, status DESC LIMIT 2`, timeout: 5000 },
        [event.channel_id, sender, new Date(timestamp).toISOString()]);
      if (commands.length > 1 && commands[0].occurred_at === commands[1].occurred_at && commands[0].status !== commands[1].status) {
        throw new Error('Ambiguous routing command order');
      }
      // Unknown dev replies must never probe or fall through to a production backend.
      return commands[0]?.status === 'ROUTE_COMMAND_DEV' ? 'unknown' : 'prod';
    },
    async resolve(event, sender) {
      if (!testPhones.has(sender) || event.channel_id !== env.LYCHEE_CHANNEL_ID) throw new Error('Unauthorized routing sender or channel');
      if (![event.event_id, event.message_id, event.whatsapp_message_id].every(x => typeof x === 'string' && x.length > 0 && x.length <= 255) ||
          typeof event.text !== 'string' || event.text.length > 8192 || typeof event.has_media !== 'boolean' ||
          typeof event.message_type !== 'string' || event.reply_to_whatsapp_message_id) throw new Error('Invalid routing event');
      const timestamp = typeof event.occurred_at === 'string' && event.occurred_at.length <= 64 ? Date.parse(event.occurred_at) : NaN;
      if (!Number.isFinite(timestamp)) throw new Error('Event timestamp required');
      const occurredAt = new Date(timestamp).toISOString();
      const command = routingCommand(event);
      const digest = value => createHash('sha256').update(value).digest('hex');
      const key = 'route:' + digest(JSON.stringify([event.channel_id, event.event_id]));
      const hash = digest(JSON.stringify(event));
      const lock = digest(JSON.stringify(['keepintax-dev', event.channel_id, sender]));
      const connection = await getPool().getConnection();
      const query = async (sql, args) => (await connection.query({ sql, timeout: 5000 }, args))[0];
      let locked = false;
      try {
        const acquired = await query('SELECT GET_LOCK(?, 2) AS acquired', [lock]);
        locked = Number(acquired[0]?.acquired) === 1;
        if (!locked) throw new Error('Routing state busy');
        const existing = await query('SELECT payload_hash, status FROM lychee_intake_events WHERE event_id=?', [key]);
        if (existing.length) {
          const status = existing[0].status;
          if (existing[0].payload_hash !== hash || !['ROUTE_DEV', 'ROUTE_PROD', 'ROUTE_COMMAND_DEV', 'ROUTE_COMMAND_PROD'].includes(status)) {
            throw new Error('Conflicting routing journal event');
          }
          return { environment: status.endsWith('_DEV') ? 'dev' : 'prod', command: status.startsWith('ROUTE_COMMAND_') };
        }
        let environment = command || 'prod';
        if (!command) {
          const previous = await query(`SELECT DISTINCT status,
            JSON_UNQUOTE(JSON_EXTRACT(payload, '$.occurred_at')) AS occurred_at
            FROM lychee_intake_events WHERE channel_id=? AND sender_phone=?
            AND status IN ('ROUTE_COMMAND_DEV','ROUTE_COMMAND_PROD')
            AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.occurred_at')) <= ?
            ORDER BY occurred_at DESC, status DESC LIMIT 2`, [event.channel_id, sender, occurredAt]);
          if (previous.length > 1 && previous[0].occurred_at === previous[1].occurred_at && previous[0].status !== previous[1].status) {
            throw new Error('Ambiguous routing command order');
          }
          if (previous.length) environment = previous[0].status === 'ROUTE_COMMAND_DEV' ? 'dev' : 'prod';
        }
        await query(`INSERT INTO lychee_intake_events
          (event_id, channel_id, message_id, sender_phone, payload, payload_hash, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [key, event.channel_id, event.message_id, sender,
          JSON.stringify({ ...event, occurred_at: occurredAt }), hash,
          (command ? 'ROUTE_COMMAND_' : 'ROUTE_') + environment.toUpperCase()]);
        return { environment, command: !!command };
      } finally {
        let reusable = true;
        try {
          if (locked) {
            const released = await query('SELECT RELEASE_LOCK(?) AS released', [lock]);
            if (Number(released[0]?.released) !== 1) throw new Error('Routing lock release not confirmed');
          }
        }
        catch (error) { reusable = false; connection.destroy(); throw error; }
        finally { if (reusable) connection.release(); }
      }
    },
    async close() { if (pool) await pool.end(); },
  };
}

module.exports = { databaseOptions, routingCommand, createRoutingStore };
