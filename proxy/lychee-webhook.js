const { createHmac, timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');
const { createRoutingStore, routingCommand } = require('./lychee-routing-store');

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

function createHandler(config, fetchImpl = fetch, routingStore) {
  function audit(eventId, stage, outcome, message, details = {}) {
    const event_id = typeof eventId === 'string' && /^[A-Za-z0-9_.:-]{1,255}$/.test(eventId) ? eventId : undefined;
    console.info(JSON.stringify({ component: 'LycheeProxy', event_id, stage, outcome, message, ...details }));
  }
  async function controlRequest(target, endpoint, raw, signature) {
    const url = new URL(target);
    url.pathname = url.pathname.replace(/\/+$/, '') + '/' + endpoint;
    const response = await fetchImpl(url.href, {
      method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-lychee-signature': signature },
      body: raw, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      if (response.body) await response.body.cancel();
      throw Object.assign(new Error('Reply ownership lookup unavailable'), { httpStatus: response.status });
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
    return data;
  }
  async function ownsReply(target, raw, signature) {
    const data = await controlRequest(target, 'reply-owner', raw, signature);
    if (typeof data?.ownsReply !== 'boolean') throw new Error('Invalid ownership response');
    return data.ownsReply;
  }
  return async (req, res) => {
    const started = Date.now();
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      audit(undefined, 'webhook.receive', 'blocked', 'גוף הבקשה אינו JSON גולמי');
      return res.status(400).json({ error: 'Raw JSON required' });
    }
    const header = req.headers['x-lychee-signature'];
    const expected = 'sha256=' + createHmac('sha256', config.secret).update(raw).digest('hex');
    if (typeof header !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(header) ||
        !timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
      audit(undefined, 'webhook.signature', 'blocked', 'חתימה חסרה או שגויה; האירוע לא יועבר');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    let event;
    try { event = JSON.parse(raw.toString('utf8')); }
    catch {
      audit(undefined, 'webhook.parse', 'blocked', 'גוף הבקשה אינו JSON תקין');
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    if (!event || event.event !== 'message.received' ||
        typeof event.event_id !== 'string' || !event.event_id ||
        event.channel_id !== config.channelId) {
      audit(event?.event_id, 'webhook.event', 'blocked', event?.channel_id !== config.channelId ?
        'מזהה הערוץ אינו תואם לערוץ המוגדר בפרוקסי' : 'סוג האירוע או מזהה האירוע אינם תקינים');
      return res.status(400).json({ error: 'Invalid event or channel' });
    }
    const contact = phone(event.contact_phone);
    const missingSender = event.sender_phone == null ||
      typeof event.sender_phone === 'string' && !event.sender_phone.trim();
    const sender = missingSender ? contact : phone(event.sender_phone);
    if (!sender || !contact || sender !== contact) {
      audit(event.event_id, 'sender.resolve', 'blocked', 'מספר איש הקשר אינו תקין או שיש סתירה עם מספר השולח');
      return res.status(400).json({ error: 'Invalid or ambiguous sender' });
    }
    let target = config.prodUrl;
    let activeStage = 'reply.resolve';
    audit(event.event_id, 'webhook.verify', 'completed', 'החתימה, הערוץ וזהות השולח אושרו');
    try {
      const replyId = event.reply_to_whatsapp_message_id;
      if (replyId != null && replyId !== '') {
        if (typeof replyId !== 'string' || replyId.length > 255) {
          audit(event.event_id, 'reply.resolve', 'blocked', 'מזהה ההודעה המצוטטת אינו תקין');
          return res.status(400).json({ error: 'Invalid reply identifier' });
        }
        // Persistent ownership lives in each backend DB, not in proxy instance memory.
        const candidates = config.testPhones.has(sender) ? [config.prodUrl, config.devUrl] : [config.prodUrl];
        audit(event.event_id, 'reply.resolve', 'started', 'בדיקת בעלות השאלה בסביבות המורשות לפני ניתוב התשובה');
        const ownership = await Promise.all(candidates.map(url => ownsReply(url, raw, header)));
        const matches = candidates.filter((_url, index) => ownership[index]);
        if (matches.length !== 1) {
          audit(event.event_id, 'reply.resolve', 'blocked', matches.length ?
            'נמצא מיפוי בשתי סביבות; אין ניתוב אוטומטי' : 'לא נמצא מיפוי שאלה; אין העברה אוטומטית לפרוד');
          return res.status(409).json({ error: 'Unknown or ambiguous reply ownership' });
        }
        target = matches[0];
      } else if (config.testPhones.has(sender)) {
        activeStage = 'route.resolve';
        // Development SQL is the durable authority, independent of either backend's availability.
        if (!routingStore) throw new Error('Routing storage unavailable');
        audit(event.event_id, 'route.resolve', 'started', 'קריאת מצב הבדיקות ושמירת החלטת הניתוב במסד הדב');
        const route = await routingStore.resolve(event, sender);
        const requested = routingCommand(event);
        const command = requested !== null;
        if (!['dev', 'prod'].includes(route?.environment) || route.command !== command ||
            command && route.environment !== requested) {
          throw new Error('Invalid routing response');
        }
        if (command) {
          audit(event.event_id, 'route.command', 'completed', route.environment === 'dev' ?
            'מצב בדיקות הופעל ונשמר; המסמכים הבאים מהשולח יגיעו לדב' :
            'מצב בדיקות הסתיים ונשמר; המסמכים הבאים מהשולח יגיעו לפרוד');
          return res.status(200).json({ received: true });
        }
        target = route.environment === 'dev' ? config.devUrl : config.prodUrl;
      }
      audit(event.event_id, 'route.forward', 'started', event.reply_to_whatsapp_message_id ?
        'התשובה מנותבת לפי הבעלות השמורה של השאלה' : target === config.devUrl ?
        'מצב בדיקות פעיל למספר מורשה; העברה לדב' :
        'ניתוב לפרוד לפי הרשאת השולח ומצב הבדיקות השמור', { environment: target === config.devUrl ? 'dev' : 'prod' });
      activeStage = 'route.forward';
      const response = await fetchImpl(target, {
        method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-lychee-signature': header },
        body: raw, signal: AbortSignal.timeout(10000),
      });
      const accepted = response.ok;
      // Do not relay backend payloads or signed media URLs to the sender/logs.
      if (response.body) await response.body.cancel();
      audit(event.event_id, 'route.forward', accepted ? 'completed' : 'failed', accepted ?
        'המקלט ביעד אישר את קבלת האירוע' : 'המקלט ביעד דחה את האירוע; מוחזרת שגיאה כדי לאפשר ניסיון חוזר',
        { environment: target === config.devUrl ? 'dev' : 'prod', httpStatus: response.status, durationMs: Date.now() - started });
      return res.status(accepted ? 200 : 502).json(accepted ? { received: true } : { error: 'Destination rejected event' });
    } catch (error) {
      const databaseReasons = {
        LYCHEE_DB_CONFIG: 'הגדרות חיבור מסד הדב בפרוקסי חסרות או אינן תקינות; מותר רק keepintax-dev',
        ER_BAD_DB_ERROR: 'מסד הדב המוגדר אינו קיים בשרת המסד',
        ER_ACCESS_DENIED_ERROR: 'מסד הדב דחה את פרטי ההתחברות של הפרוקסי',
        ER_DBACCESS_DENIED_ERROR: 'למשתמש הפרוקסי אין הרשאה למסד הדב',
        ER_TABLEACCESS_DENIED_ERROR: 'למשתמש הפרוקסי אין הרשאות מתאימות לטבלת הניתוב',
        ER_NO_SUCH_TABLE: 'טבלת ליצ׳י אינה קיימת במסד הדב',
        ECONNREFUSED: 'שרת מסד הדב דחה את החיבור',
        ETIMEDOUT: 'פג זמן ההמתנה לחיבור למסד הדב',
        ENOTFOUND: 'כתובת שרת מסד הדב לא נפתרה',
        HANDSHAKE_NO_SSL_SUPPORT: 'שרת מסד הדב אינו תומך בחיבור TLS שהוגדר',
        HANDSHAKE_SSL_ERROR: 'אימות חיבור TLS למסד הדב נכשל; יש לבדוק את אישור השרת',
      };
      audit(event.event_id, activeStage, 'failed', activeStage === 'route.resolve' ? databaseReasons[error?.code] ||
        'לא ניתן לקבוע או לשמור מצב בדיקות; האירוע לא הועבר ואין מעבר לפרוד' : activeStage === 'reply.resolve' ?
        'לא ניתן לברר את בעלות השאלה: המקלט אינו זמין או החזיר תשובה לא תקינה; אין ניחוש סביבה' :
        'ההעברה למקלט נכשלה ברשת או בזמן ההמתנה; אין מעבר לסביבה אחרת',
        { durationMs: Date.now() - started,
          httpStatus: Number.isInteger(error?.httpStatus) ? error.httpStatus : undefined });
      // No production fallback: a retry must return to the selected environment.
      return res.status(502).json({ error: 'Destination unavailable' });
    }
  };
}

function registerLycheeWebhook(app, express, env = process.env) {
  const config = configuration(env);
  if (!config) return;
  // Register before any JSON parser: signatures cover the original bytes.
  // Lazy pool creation keeps missing DB settings from taking down unrelated proxy routes.
  const store = config.testPhones.size ? createRoutingStore(env, config.testPhones) : undefined;
  app.post('/lychee/webhook', express.raw({ type: 'application/json', limit: '256kb', inflate: false }),
    createHandler(config, fetch, store));
}

module.exports = { configuration, createHandler, registerLycheeWebhook };
