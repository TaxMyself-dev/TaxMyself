const { createHmac, timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');

function phone(value) {
  if (typeof value !== 'string') return null;
  let digits = value.replace(/[\s()+-]/g, '');
  if (/^05\d{8}$/.test(digits)) digits = `972${digits.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

function destination(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.hash || url.search || isIP(url.hostname) || !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal)$/.test(url.hostname)) {
    throw new Error('Expected a public HTTPS webhook URL without credentials or query');
  }
  return url.href;
}

function configuration(env) {
  if (env.LYCHEE_WEBHOOK_ENABLED !== 'true') return null;
  if (!env.LYCHEE_WEBHOOK_SECRET || !env.LYCHEE_CHANNEL_ID) {
    throw new Error('Lychee requires LYCHEE_WEBHOOK_SECRET and LYCHEE_CHANNEL_ID');
  }
  const numbers = (env.LYCHEE_TEST_PHONES || '').split(',').map(x => x.trim()).filter(Boolean);
  const normalized = numbers.map(phone);
  if (normalized.some(x => !x)) {
    throw new Error('Expected valid LYCHEE_TEST_PHONES');
  }
  const prodUrl = destination(env.LYCHEE_PROD_WEBHOOK_URL);
  const devUrl = normalized.length ? destination(env.LYCHEE_DEV_WEBHOOK_URL) : null;
  if (prodUrl === devUrl) throw new Error('Lychee dev and production destinations must differ');
  return { secret: env.LYCHEE_WEBHOOK_SECRET, channelId: env.LYCHEE_CHANNEL_ID,
    testPhones: new Set(normalized), prodUrl, devUrl };
}

function createHandler(config, fetchImpl = fetch) {
  async function ownsReply(target, raw, signature) {
    const url = new URL(target);
    url.pathname = url.pathname.replace(/\/+$/, '') + '/reply-owner';
    const response = await fetchImpl(url.href, {
      method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-lychee-signature': signature },
      body: raw, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      if (response.body) await response.body.cancel();
      throw new Error('Reply ownership lookup unavailable');
    }
    // Bound response reads; never trust an HTML/ngrok error or an arbitrary large payload.
    const reader = response.body.getReader();
    let bytes = 0, chunks = [];
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1024) throw new Error('Invalid ownership response');
        chunks.push(Buffer.from(part.value));
      }
    } finally { await reader.cancel(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof data?.ownsReply !== 'boolean') throw new Error('Invalid ownership response');
    return data.ownsReply;
  }
  return async (req, res) => {
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) return res.status(400).json({ error: 'Raw JSON required' });
    const header = req.headers['x-lychee-signature'];
    const expected = 'sha256=' + createHmac('sha256', config.secret).update(raw).digest('hex');
    if (typeof header !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(header) ||
        !timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    let event;
    try { event = JSON.parse(raw.toString('utf8')); }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    if (!event || event.event !== 'message.received' ||
        typeof event.event_id !== 'string' || !event.event_id ||
        event.channel_id !== config.channelId) {
      return res.status(400).json({ error: 'Invalid event or channel' });
    }
    const contact = phone(event.contact_phone);
    const missingSender = event.sender_phone == null ||
      typeof event.sender_phone === 'string' && !event.sender_phone.trim();
    const sender = missingSender ? contact : phone(event.sender_phone);
    if (!sender || !contact || sender !== contact) {
      return res.status(400).json({ error: 'Invalid or ambiguous sender' });
    }
    const devMarked = typeof event.text === 'string' && /(?:^|\s)#dev(?=$|\s)/i.test(event.text);
    let target = devMarked && config.testPhones.has(sender) ? config.devUrl : config.prodUrl;
    try {
      const replyId = event.reply_to_whatsapp_message_id;
      if (replyId != null && replyId !== '') {
        if (typeof replyId !== 'string' || replyId.length > 255) {
          return res.status(400).json({ error: 'Invalid reply identifier' });
        }
        // Persistent ownership lives in each backend DB, not in proxy instance memory.
        const candidates = config.testPhones.has(sender) ? [config.prodUrl, config.devUrl] : [config.prodUrl];
        const ownership = await Promise.all(candidates.map(url => ownsReply(url, raw, header)));
        const matches = candidates.filter((_url, index) => ownership[index]);
        if (matches.length !== 1) {
          return res.status(409).json({ error: 'Unknown or ambiguous reply ownership' });
        }
        target = matches[0];
      }
      const response = await fetchImpl(target, {
        method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-lychee-signature': header },
        body: raw, signal: AbortSignal.timeout(10000),
      });
      const accepted = response.ok;
      // Do not relay backend payloads or signed media URLs to the sender/logs.
      if (response.body) await response.body.cancel();
      return res.status(accepted ? 200 : 502).json(accepted ? { received: true } : { error: 'Destination rejected event' });
    } catch {
      // No production fallback: a retry must return to the selected environment.
      return res.status(502).json({ error: 'Destination unavailable' });
    }
  };
}

function registerLycheeWebhook(app, express, env = process.env) {
  const config = configuration(env);
  if (!config) return;
  // Register before any JSON parser: signatures cover the original bytes.
  app.post('/lychee/webhook', express.raw({ type: 'application/json', limit: '256kb', inflate: false }),
    createHandler(config));
}

module.exports = { configuration, createHandler, registerLycheeWebhook };
