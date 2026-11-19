'use strict';
// Real local exporter + real onboarding service/model wrappers, synthetic memory
// and mocked OpenAI replies. No server, real-user data or database connection.
const path = require('node:path'),
  fs = require('node:fs'),
  { randomUUID } = require('node:crypto');
const backend = path.resolve(__dirname, '..');
require(path.join(backend, 'node_modules/dotenv')).config({
  path: path.join(backend, '.env'),
  quiet: true,
});
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules/ts-node/register/transpile-only'));
require(path.join(backend, 'node_modules/tsconfig-paths/register'));
const { localOnboardingTraceConfig, onboardingTracing } = require(path.join(
  backend,
  'src/agent-onboarding/onboarding.tracing',
));
const { OnboardingService } = require(path.join(
  backend,
  'src/agent-onboarding/onboarding.service',
));
const { OnboardingExtractor } = require(path.join(
  backend,
  'src/agent-onboarding/onboarding.extractor',
));
const { FIELDS } = require(path.join(
  backend,
  'src/agent-onboarding/onboarding.domain',
));
const config = localOnboardingTraceConfig();
if (!config) throw Error('LOCAL_LANGFUSE_NOT_CONFIGURED');
process.env.AGENT_ONBOARDING_ENABLED = 'true';
process.env.AGENT_ONBOARDING_MODEL = 'onboarding-trace-smoke';
process.env.AGENT_ONBOARDING_CONVERSATION_MODEL = 'onboarding-trace-smoke';
process.env.OPENAI_API_KEY = 'synthetic-not-used';
const userId = 'onboarding-trace-smoke-' + randomUUID(),
  user = { firebaseId: userId, actorFirebaseId: userId };
const states = (scope) =>
  Object.fromEntries(
    FIELDS.filter(
      (f) =>
        f.scope === scope &&
        !['vehicle', 'employees', 'partners'].includes(f.key),
    ).map((f) => [f.key, 'known']),
  );
const person = {
  id: 'synthetic-person',
  scope_key: '',
  version: 1,
  field_states: states('person'),
  story: 'זהו משתמש סינתטי',
  preferred_name: 'משתמש בדיקה',
  employment: 'כן',
};
const business = {
  id: 'synthetic-business',
  scope_key: '111',
  version: 1,
  field_states: states('business'),
  story: 'זהו עסק סינתטי',
  registration: 'עוסק פטור',
  activity: 'בדיקת תיעוד',
  workplace: 'בית',
};
let facts = [],
  turns = [
    {
      source_text: 'בדיקה',
      assistant_text: 'האם אתה משתמש ברכב לצורכי העסק?',
      asked_field: 'vehicle',
      created_at: new Date(),
    },
  ];
const exportsSeen = [],
  networkFetch = global.fetch;
global.fetch = async (url, init) => {
  if (String(url) === 'https://api.openai.com/v1/chat/completions') {
    const request = JSON.parse(init.body),
      properties = request.response_format.json_schema.schema.properties;
    const output = properties.facts
      ? {
          intent: 'share',
          clarification: null,
          deferredField: null,
          forgetIds: [],
          facts: [
            {
              field: 'vehicle',
              scope: 'business',
              statement: 'רכב פרטי שמשמש גם בעסק',
              value: 'כן',
              state: 'known',
              replaces: null,
              change: 'add',
              effectiveDate: null,
              precision: 'unknown',
              evidence: ['source-0'],
              invalidates: [],
              workplaceModes: null,
            },
          ],
        }
      : properties.nextField
      ? { kind: 'conversation', reply: 'הבנתי.', nextField: 'employees' }
      : { story: 'זהו משתמש סינתטי עם רכב שמשמש גם בעסק, ללא עובדים.' };
    return new Response(
      JSON.stringify({
        id: 'synthetic-model-response',
        model: 'onboarding-trace-smoke',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(output) },
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (String(url) === config.baseUrl + '/api/public/otel/v1/traces') {
    const spans = JSON.parse(init.body).resourceSpans[0].scopeSpans[0].spans;
    exportsSeen.push({
      traceId: spans[0].traceId,
      names: spans.map((s) => s.name),
    });
  }
  return networkFetch(url, init);
};
const query = async (sql) => {
  if (sql.includes('TIMESTAMPDIFF')) return [{ applied_at: new Date() }];
  if (sql.startsWith('SELECT * FROM agent_onboarding_profiles'))
    return [
      { ...person, field_states: { ...person.field_states } },
      { ...business, field_states: { ...business.field_states } },
    ];
  if (sql.startsWith('SELECT * FROM agent_onboarding_facts')) return facts;
  if (sql.startsWith('SELECT c.source_text')) return turns;
  return { affectedRows: 1 };
};
const db = {
  query,
  manager: { query },
  transaction: async (work) => work({ query }),
};
const service = new OnboardingService(
  db,
  {
    ownerBusinesses: async () => [
      { businessNumber: '111', businessName: 'בדיקת תיעוד' },
    ],
  },
  new OnboardingExtractor(),
);
const auth =
  'Basic ' +
  Buffer.from(config.publicKey + ':' + config.secretKey).toString('base64');
async function observations(traceId) {
  const params = new URLSearchParams({
    traceId,
    fromStartTime: new Date(Date.now() - 300000).toISOString(),
    limit: '100',
    fields: 'core,basic,io',
  });
  const response = await networkFetch(
    config.baseUrl + '/api/public/v2/observations?' + params,
    {
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
      headers: { Authorization: auth },
    },
  );
  if (!response.ok) throw Error('OBSERVATION_READ_FAILED:' + response.status);
  return (await response.json()).data;
}
(async () => {
  const health = await networkFetch(config.baseUrl + '/api/public/health', {
    signal: AbortSignal.timeout(4000),
  });
  if (!health.ok) throw Error('LOCAL_LANGFUSE_UNAVAILABLE');
  const first = await service.propose(user, {
    businessNumber: '111',
    version: { person: 1, business: 1 },
    message: 'רכב פרטי משמש אותי גם בעסק',
  });
  facts = first.facts.map((f) => ({
    id: 'synthetic-vehicle',
    field_key: f.field,
    scope_kind: f.scope,
    statement: f.statement,
    value_text: f.value,
    status: 'active',
  }));
  business.field_states.vehicle = 'known';
  business.vehicle = 'כן';
  turns.push({
    source_text: 'רכב פרטי משמש אותי גם בעסק',
    assistant_text: first.reply,
    asked_field: first.askedField,
    created_at: new Date(),
  });
  await service.commit(user, '111', first.id); // synthetic applied-receipt retry
  const second = await service.propose(user, {
    businessNumber: '111',
    version: { person: 1, business: 1 },
    message: 'לא',
  });
  if (second.facts[0]?.field !== 'employees')
    throw Error('SHORT_ANSWER_CHANGED');
  await service.summarize(user, '111', { person: 1, business: 1 });
  await onboardingTracing.flush();
  if (exportsSeen.length !== 4) throw Error('EXPECTED_FOUR_REQUEST_TRACES');
  const verified = [];
  for (const exported of exportsSeen) {
    let rows = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      rows = await observations(exported.traceId);
      if (exported.names.every((name) => rows.some((row) => row.name === name)))
        break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!exported.names.every((name) => rows.some((row) => row.name === name)))
      throw Error('MISSING_INGESTED_STAGES:' + exported.traceId);
    if (rows.some((row) => row.input == null || row.output == null))
      throw Error('MISSING_STAGE_IO:' + exported.traceId);
    const ids = new Set(rows.map((row) => row.id));
    if (
      rows.some(
        (row) => row.parentObservationId && !ids.has(row.parentObservationId),
      )
    )
      throw Error('BROKEN_PARENT_HIERARCHY');
    if (
      rows.some(
        (row) =>
          row.userId !== userId ||
          row.sessionId !== 'onboarding:' + userId + ':111',
      )
    )
      throw Error('MISSING_REQUEST_CONTEXT');
    if (
      rows.some(
        (row) => row.name.startsWith('model.') && row.type !== 'GENERATION',
      )
    )
      throw Error('MODEL_SPAN_NOT_GENERATION');
    verified.push({
      traceId: exported.traceId,
      stages: rows.map((row) => row.name),
      observations: rows.length,
      url:
        config.baseUrl +
        '/project/keepintax-agent-dev/traces/' +
        exported.traceId,
    });
  }
  const firstNames = verified[0].stages;
  for (const name of [
    'onboarding.propose',
    'onboarding.read',
    'model.extract',
    'model.respond',
    'facts.validate',
    'answer.route',
    'response.ready',
    'proposal.persist',
  ])
    if (!firstNames.includes(name))
      throw Error('REQUIRED_STAGE_MISSING:' + name);
  if (verified[2].stages.some((name) => name.startsWith('model.')))
    throw Error('SHORT_ANSWER_SHOULD_NOT_CALL_MODEL');
  if (!verified[3].stages.includes('model.summary'))
    throw Error('SUMMARY_GENERATION_MISSING');
  if (!verified[1].stages.includes('memory.commit'))
    throw Error('COMMIT_STAGE_MISSING');
  console.log(
    JSON.stringify({
      baseUrl: config.baseUrl,
      project: 'keepintax-agent-dev',
      sessionId: 'onboarding:' + userId + ':111',
      verified,
    }),
  );
  const folder = path.join(backend, '../.test-tmp/onboarding-tracing');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'last-smoke.json'),
    JSON.stringify({ userId, verified }, null, 2),
  );
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = networkFetch;
  });
