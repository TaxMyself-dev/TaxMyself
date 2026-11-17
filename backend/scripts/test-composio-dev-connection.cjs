// Explicitly approved DEV connection-only diagnostic. Never boots the app or scheduler.
// User completes Google consent in their own browser. No message/search/import tools.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const cfg = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));

async function main() {
  if (cfg.DB_DATABASE !== 'keepintax-dev' || cfg.COMPOSIO_ENVIRONMENT !== 'dev' || cfg.DISABLE_SYNCHRONIZE !== 'true') throw Error('DEV safety configuration required');
  if (!cfg.COMPOSIO_API_KEY?.trim() || !cfg.COMPOSIO_GMAIL_AUTH_CONFIG_ID?.trim()) throw Error('DEV Composio configuration missing');
  Object.assign(process.env, cfg, {
    NODE_ENV: 'development', COMPOSIO_ENVIRONMENT: 'dev', COMPOSIO_EMAIL_ENABLED: 'true',
    DISABLE_SYNCHRONIZE: 'true', SKIP_BOOT_SEED: 'true',
    COMPOSIO_GMAIL_CALLBACK_URL: 'http://127.0.0.1:4317/integrations/google/callback',
  });
  const { UserIntegration } = require('../dist/integrations/entities/user-integration.entity');
  const { OauthState } = require('../dist/integrations/entities/oauth-state.entity');
  const { ComposioClientService } = require('../dist/integrations/services/composio-client.service');
  const { OauthStateService } = require('../dist/integrations/services/oauth-state.service');
  const { UserIntegrationsService } = require('../dist/integrations/services/user-integrations.service');
  const { EmailConnectionsService } = require('../dist/integrations/services/email-connections.service');
  const composio = new ComposioClientService();
  const sdk = composio.client();
  const link = sdk.connectedAccounts.link.bind(sdk.connectedAccounts);
  sdk.connectedAccounts.link = async (...args) => {
    try { return await link(...args); }
    catch (error) {
      const causes = [];
      for (let cause = error; cause && causes.length < 5; cause = cause.cause) {
        const message = String(cause.message || '').toLowerCase();
        causes.push({ name: cause.name, status: cause.status || null,
          permissionExplanation: cause.status === 403 ? String(cause.message || '')
            .split(cfg.COMPOSIO_API_KEY).join('[redacted-key]')
            .split(cfg.COMPOSIO_GMAIL_AUTH_CONFIG_ID).join('[redacted-config]')
            .replace(/https?:\/\/[^\s"']+/g, '[redacted-url]').slice(0, 400) : undefined,
          mentionsPermission: message.includes('permission'), mentionsApiKey: message.includes('api key'),
          mentionsAuthConfig: message.includes('auth config') || message.includes('auth_config'),
          mentionsCallback: message.includes('callback') || message.includes('redirect'),
          mentionsScope: message.includes('scope'), mentionsNotFound: message.includes('not found'),
          mentionsAccessDenied: message.includes('access denied') || message.includes('forbidden'),
        });
      }
      console.error(JSON.stringify({ linkFailure: true, causes }));
      throw error;
    }
  };
  const definition = await sdk.tools.getRawComposioToolBySlug('GMAIL_WHO_AM_I');
  if (!/^\d{8}_\d+$/.test(definition.version)) throw Error('Identity toolkit version unavailable');
  process.env.COMPOSIO_GMAIL_TOOLKIT_VERSION = definition.version;
  const execute = sdk.tools.execute.bind(sdk.tools);
  let identityExecutions = 0;
  sdk.tools.execute = async (slug, ...args) => {
    if (slug !== 'GMAIL_WHO_AM_I') throw Error('Connection-only policy blocked mailbox tool');
    identityExecutions++;
    return execute(slug, ...args);
  };
  sdk.connectedAccounts.delete = async () => { throw Error('Connection-only diagnostic does not delete connections'); };

  const db = new DataSource({ type: 'mysql', host: cfg.DB_HOST, port: Number(cfg.DB_PORT || 3306), username: cfg.DB_USERNAME, password: cfg.DB_PASSWORD, database: 'keepintax-dev', entities: [UserIntegration, OauthState], synchronize: false, migrationsRun: false, logging: false, connectTimeout: 10000 });
  await db.initialize();
  try {
    const [identity] = await db.query('SELECT DATABASE() AS db');
    if (identity.db !== 'keepintax-dev') throw Error('Database identity mismatch');
  } catch (error) { await db.destroy(); throw error; }
  const testUser = `composio-dev-connection-test-${randomUUID()}`;
  const integrations = new UserIntegrationsService(db.getRepository(UserIntegration));
  const connections = new EmailConnectionsService(composio, new OauthStateService(db.getRepository(OauthState)), integrations);
  let status = 'pending';
  let callbackInFlight = false;
  let timer;
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const url = new URL(request.url, 'http://127.0.0.1:4317');
    if (request.method === 'GET' && url.pathname === '/status') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ status, identityExecutions, messageToolsExecuted: 0, applicationBooted: false }));
      return;
    }
    if (request.method !== 'GET' || url.pathname !== '/integrations/google/callback' || status !== 'pending' || callbackInFlight) { response.writeHead(404); response.end('Not found'); return; }
    callbackInFlight = true;
    try {
      await connections.complete(url.searchParams.get('state') || '', url.searchParams.get('connected_account_id') || '', url.searchParams.get('status') || 'failed');
      const rows = await integrations.findAllForUser(testUser);
      if (rows.length !== 1 || rows[0].status !== 'ACTIVE' || rows[0].initialImportCompletedAt || rows[0].refreshToken || rows[0].accessToken) throw Error('Connection verification failed');
      status = 'connected';
      console.log(JSON.stringify({ status, database: 'keepintax-dev', integrationId: rows[0].id, mailboxIdentityVerified: true, tokensStoredLocally: false, initialImportStarted: false, identityExecutions, messageToolsExecuted: 0 }));
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end('DEV Gmail connection verified. No messages searched, read or imported. You can close this tab.');
    } catch (error) {
      status = 'failed';
      console.error(JSON.stringify({ status, safeError: error.category || error.code || error.name || 'unknown', identityExecutions, messageToolsExecuted: 0 }));
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('DEV connection could not be verified. No message tools were executed. Return to the Codex chat.');
    } finally { callbackInFlight = false; }
  });
  const close = async () => { clearTimeout(timer); server.close(); if (db.isInitialized) await db.destroy(); };
  process.once('SIGINT', () => { close().finally(() => process.exit(0)); });
  process.once('SIGTERM', () => { close().finally(() => process.exit(0)); });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4317, '127.0.0.1', resolve); });
    timer = setTimeout(() => { console.log(JSON.stringify({ status: 'diagnostic-expired' })); close(); }, 10 * 60 * 1000);
    const result = await connections.connect(testUser);
    console.log(JSON.stringify({ status: 'awaiting-user-consent', redirectUrl: result.url, callback: 'http://127.0.0.1:4317/integrations/google/callback', toolkitVersion: definition.version, database: 'keepintax-dev', technicalDevUser: true, schedulerStarted: false, messageToolsAllowed: false }));
  } catch (error) { await close(); throw error; }
}
main().catch(error => { console.error(JSON.stringify({ diagnosticFailed: true, safeError: error.category || error.code || error.name || 'unknown' })); process.exitCode = 1; });
