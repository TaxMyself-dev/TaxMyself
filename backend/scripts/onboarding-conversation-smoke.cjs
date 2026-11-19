'use strict';
// Synthetic, read-only model diagnostics. No database or application server.
const path = require('node:path');
if (process.argv[2] !== '--run-paid-model-smoke' || process.argv.length !== 3)
  throw new Error(
    'Use --run-paid-model-smoke to run the seven bounded synthetic model diagnostics.',
  );
const backend = path.resolve(__dirname, '..');
require(path.join(backend, 'node_modules/dotenv')).config({
  path: path.join(backend, '.env'),
  quiet: true,
});
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules/ts-node/register/transpile-only'));
require(path.join(backend, 'node_modules/tsconfig-paths/register'));
const { OnboardingExtractor } = require(path.join(
  backend,
  'src/agent-onboarding/onboarding.extractor',
));
const { FIELDS } = require(path.join(
  backend,
  'src/agent-onboarding/onboarding.domain',
));
const { OnboardingService } = require(path.join(
  backend,
  'src/agent-onboarding/onboarding.service',
));
process.env.AGENT_ONBOARDING_ENABLED = 'true';
const extractor = new OnboardingExtractor();
const context = {
  fields: FIELDS.map((f) => ({ ...f, state: 'unasked', value: null })),
  activeFacts: [],
  history: [],
  story: {},
  turns: [],
  question: null,
};
let tokens = { prompt: 0, completion: 0 },
  failures = 0;
const fetchOriginal = global.fetch;
global.fetch = async (...args) => {
  const response = await fetchOriginal(...args);
  if (response.ok) {
    const data = await response.clone().json();
    tokens.prompt += data.usage?.prompt_tokens || 0;
    tokens.completion += data.usage?.completion_tokens || 0;
  }
  return response;
};
function check(name, condition, output) {
  if (!condition) failures++;
  console.log(JSON.stringify({ name, passed: !!condition, output }));
}
async function ask(message, ctx = context) {
  const service = new OnboardingService(
    { query: async () => [] },
    { ownerBusinesses: async () => [{ businessNumber: '111' }] },
    extractor,
  );
  service.read = async () => ({
    businessNumber: '111',
    version: { person: 0, business: 0 },
    fields: ctx.fields,
    facts: [...ctx.activeFacts, ...ctx.history],
    turns: ctx.turns,
    story: ctx.story,
  });
  return service.propose(
    { firebaseId: 'synthetic', actorFirebaseId: 'synthetic' },
    { businessNumber: '111', version: { person: 0, business: 0 }, message },
  );
}
(async () => {
  let result = await ask('קוראים לי שמואל ואני גם עצמאי וגם שכיר');
  check(
    'introduction-no-invented-dates-or-repeated-name',
    result.facts.some((f) => f.field === 'preferred_name') &&
      result.facts.some((f) => f.field === 'employment') &&
      result.facts.every((f) => f.effectiveDate === null) &&
      !/איך.*(אפנה|לפנות)/.test(result.reply),
    result,
  );
  for (const [i, f] of result.facts.entries()) {
    context.activeFacts.push({
      id: 'fact-' + i,
      field_key: f.field,
      scope_kind: f.scope,
      statement: f.statement,
      value_text: f.value,
      status: 'active',
      effective_date: f.effectiveDate,
      date_precision: f.precision,
    });
    const field = context.fields.find((x) => x.key === f.field);
    if (field) {
      field.state = f.state;
      field.value = f.value;
    }
  }
  context.turns.push({
    source_text: 'קוראים לי שמואל ואני גם עצמאי וגם שכיר',
    assistant_text: result.reply,
  });
  result = await ask('תכווין אותי בשאלות');
  check(
    'guidance-without-fabricated-answer',
    result.facts.length === 0 && result.reply.includes('?'),
    result,
  );
  context.turns.push({
    source_text: 'תכווין אותי בשאלות',
    assistant_text: result.reply,
  });
  result = await ask('רגע, מה אתה כבר יודע עלי?');
  check(
    'recall-after-guidance',
    result.facts.length === 0 &&
      /שמואל/.test(result.reply) &&
      /שכיר/.test(result.reply) &&
      /עצמאי/.test(result.reply),
    result,
  );
  const deferred = {
    ...context,
    turns: [
      ...context.turns,
      { source_text: 'בוא נמשיך', assistant_text: 'מה העסק שלך עושה בפועל?' },
    ],
  };
  result = await ask('אין לי תשובה כרגע, נחזור לזה אחר כך', deferred);
  check(
    'natural-deferral',
    result.facts.some(
      (f) => f.field === 'activity' && ['unknown', 'skipped'].includes(f.state),
    ),
    result,
  );
  result = await ask('איך משנים את הסיסמה באפליקציה?');
  check(
    'off-topic-boundary',
    result.facts.length === 0 &&
      /היכרות/.test(result.reply) &&
      /סוכן/.test(result.reply) &&
      !/הגדרות/.test(result.reply),
    result,
  );
  const workplace = {
    id: 'home',
    field_key: 'workplace',
    scope_kind: 'business',
    statement: 'עובד מהבית',
    value_text: 'בית',
    status: 'active',
    effective_date: null,
  };
  const moved = {
    ...context,
    activeFacts: [...context.activeFacts, workplace],
    fields: context.fields.map((f) =>
      f.key === 'workplace' ? { ...f, state: 'known', value: 'בית' } : f,
    ),
  };
  result = await ask(
    'באוקטובר 2026 התחלתי לעבוד גם מהמשרד, ואני עדיין עובד מהבית',
    moved,
  );
  check(
    'dated-parallel-workplace',
    result.facts.some(
      (f) =>
        f.field === 'workplace' &&
        f.change === 'transition' &&
        f.effectiveDate === '2026-10' &&
        f.precision === 'month' &&
        f.workplaceModes.includes('home') &&
        f.workplaceModes.includes('office'),
    ) && !/האם.*(הבית|מהבית)/.test(result.reply),
    result,
  );
  const facts = [
    ...context.activeFacts,
    workplace,
    ...result.facts.map((f) => ({
      field_key: f.field,
      scope_kind: f.scope,
      statement: f.statement,
      status: 'active',
      change_kind: f.change,
      effective_date: f.effectiveDate,
      date_precision: f.precision,
    })),
  ];
  facts.find((f) => f.id === 'home').status = 'superseded';
  const story = await extractor.summarize({
    fields: moved.fields,
    facts,
    sourceNarrative:
      'נמסר במועד 2026-11-19: קוראים לי שמואל ואני גם עצמאי וגם שכיר. אני מתכנן קורס דיגיטלי.',
  });
  check(
    'single-natural-story',
    /שמואל/.test(story) &&
      /שכיר/.test(story) &&
      /עצמאי/.test(story) &&
      /2026|אוקטובר/.test(story) &&
      !/דיוק|נמסר במועד|scope_kind|2026-11-19|גמישות|ונוחות|צעד משמעותי|במסע/.test(
        story,
      ),
    story,
  );
  console.log(
    JSON.stringify({
      total: 7,
      failures,
      tokens,
      extractionModel: process.env.AGENT_ONBOARDING_MODEL || 'gpt-4.1-mini',
      conversationModel:
        process.env.AGENT_ONBOARDING_CONVERSATION_MODEL ||
        process.env.AGENT_ONBOARDING_MODEL ||
        'gpt-4.1',
    }),
  );
  process.exitCode = failures ? 1 : 0;
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
