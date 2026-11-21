# Shared agent profile and onboarding interface

KeepInTax has one agent system. `/agent/onboarding` is an interface-specific
policy of `createAppAgent`, not a second assistant, model client or conversation
engine. The ordinary chat uses the same profile tools without proactively
asking onboarding questions. The dedicated onboarding interface is admin-only,
launched from the admin console tab "היכרות עם הסוכן". The normal app shell has
no onboarding menu link or automatic invitation. `/dev/agent/onboarding` redirects
to the same admin-guarded canonical route.

## Conversation and tracing

Both Angular interfaces use `createDevAgentChat` and the template's
`POST /api/agent/chat`, stored `agent_chat_*` messages, streaming/resumption,
tool loop, write serialization, approval rules, retry behavior and stop hooks.
Onboarding restricts active tools and the server approval gate to shared profile
reads/writes and conversation-result reads. Business/profile source is checked
again in each tool. The existing template Langfuse integration traces the same
agent model/tool calls, inputs and outputs to the configured local Langfuse.
There is no separate extractor, responder, summarizer or tracing exporter.

The UI explicitly chooses an owned business. For a new onboarding conversation,
the backend verifies the persisted actor ADMIN role and owner access, and writes `data-onboardingContext` to stored
history. Future turns restore this binding, even when the client omits the mode.
Changing a conversation's interface or bound business is rejected. The shared chat
endpoint rechecks admin authorization on every onboarding turn, including stored
mode restoration; profile HTTP endpoints use Firebase plus OnboardingAdminGuard. This never
uses the application's hidden business header. Incoming user parts cannot write
the server marker. Delegates/admin impersonation cannot read or edit the owner's
personal profile. Ordinary accounting tools retain their existing permissions.

Users tell their story freely and can request guidance in text. The same model
interprets short answers from the actual transcript. It asks missing basic fields
one at a time, accepts unknown/deferral, and answers profile-recall questions.
There are no guidance/skip buttons or repeated textarea placeholders. Enter sends,
Shift+Enter inserts a newline. Finishing sends an ordinary request in the same
conversation; its answer becomes the narrative summary. The UI keeps grouped
basic fields and the existing system buttons/dialogs. It does not recap after
every message. Historical pre-migration sources remain profile context, while new
chat messages are stored in the template conversation tables.

## Canonical memory

The Nest service is a deterministic, owner-scoped store exposed through a typed
`UserProfileMemory` port. `readUserProfile` returns story, facts/history, basic
fields, missing fields and versions. `updateUserProfile` supplies structured
focused mutations. Free narrative facts use `field=null`; no new DB column is
needed. The ten basic fields are preferred name, employment, business
activity/stage/registration, workplace, vehicle, employees, partners and
international work. Needs and goals are optional narrative/flexible facts
(field=null), never a missing basic field or a required onboarding question.
The retired current_need column and historical tool key remain for compatibility;
old facts are exposed as flexible memories, and erasure still clears the column.
No schema or data migration is needed.

Personal facts use the owner's empty scope key; business facts use its business
number. Existing five InnoDB tables are retained:

- `agent_onboarding_profiles`: current basic fields/state, MEDIUMTEXT story, version.
- `agent_onboarding_facts`: flexible facts, provenance, reporting time, validity,
  date precision, replacement/correction links.
- `agent_onboarding_proposals`: validated mutations, base versions and retry receipt.
- `agent_onboarding_changes`: source audit and change receipt, not a chat engine.
- `agent_onboarding_story_versions`: historical projections.

The migration SQL remains `backend/scripts/migrations/2026-11-19_agent_onboarding.sql`.
This runtime migration requires no schema change. Existing data is retained.
The initial registration can still be seeded from application data with its own
provenance; profile edits never change accounting entities or tax reports.

`prepareChanges` validates exact evidence against the CURRENT server-provided user
message, scope, replacement IDs, dates and versions. The model cannot supply an
alternative source message. A transition preserves the old period; correction
marks it erroneous. Registration/workplace transitions without an effective date
are rejected for clarification. Month precision is kept; a day is never invented.
Concurrent home/office work is represented by all continuing workplace modes.

`commit` locks owner profiles and the proposal in deterministic order and writes
facts, current fields, story/history and receipt in one transaction. The template's
conversation/tool-call UUID is the operation id: retrying the same operation is
idempotent before checking a now-stale version. A different stale operation fails;
the agent rereads and reevaluates it. The proposal expires after 30 minutes.
No AI call occurs inside the transaction.

Explicit forgetting removes a fact's field/replacement history, redacts profile
source audits and drops affected story snapshots, preserving unrelated facts.
It does not assert the opposite. Forget-all clears profile memory across the
owner's businesses and retains only a content-free receipt. Accounting records,
template chat transcripts and backups are not deleted by either operation.
The fresh profile is authoritative over obsolete transcript/context references.

Legacy `agent_memories` remain readable, but new `business_fact` saves/updates there
fail with `AGENT_PROFILE_REQUIRED`; business facts use the canonical profile.
Response preferences still use the template's preference-memory tools. No existing
legacy memory is silently migrated or deleted.

## Checks and operation

`AGENT_ONBOARDING_ENABLED=true` enables the owner-only feature. Existing Firebase,
OpenAI, MySQL and template Langfuse configuration is reused. No standalone
`LANGFUSE_ONBOARDING_ENABLED` switch is used. Local application ports remain 4204
and 3004; this migration does not start servers.

- Agent package: `npm run typecheck`, `npm run check`, `npm test`, `npm run build`.
- Nest: focused onboarding domain/store tests and `npm run build`.
- Approved synthetic dev persistence: `node scripts/run-onboarding-dev-tests.cjs
  --database=keepintax-dev --persistence-only` from backend. No HTTP listener.
- Angular: onboarding/shared-chat ChromeHeadless tests using
  `tsconfig.onboarding-spec.json`, then the production build.

The old extractor/tracer tests, standalone model smoke scripts and dedicated
propose/summary HTTP pipeline are removed. Regressions now cover the shared
agent policy/tool contracts, template harness, scoped persistence and UI transport.
Authenticated manual visual verification requires the user to start the servers.


## Chat feedback and recovery (2026-11-21)

The thinking indicator is a live assistant bubble inside the scrollable chat,
covering submitted/streaming states, with a reduced-motion-safe pulse. New messages
and status changes scroll it into view. Summary generation uses its own label.
Late callbacks after component destruction are ignored. The shared transport passes
SDK isError/isAbort/isDisconnect flags to consumers; onboarding never treats these
as successful summary completion. Profile refresh blocks competing sends briefly,
retains a completed answer on failure, and discards stale business/generation reads.
Credential-free client warning names identify chat transport versus profile-refresh
failure. These do not prove the cause of an unrecorded historical browser error.

Admin entry does not grant access to another owner's personal profile: the existing
self-service/delegation/impersonation restrictions remain. Ordinary agent profile
memory stays shared; this access restriction applies to the dedicated onboarding
surface and its HTTP management endpoints.

## Automation integration

Automatic classification keeps the authenticated /agent/chat entry. The dedicated
/agent/onboarding surface and its profile HTTP endpoints retain the onboarding
branch's Admin authorization. Settings links include the owned business number.
Completion requires known nonempty FIELDS values or explicit not_applicable;
unknown/skipped remain valid memory but block unattended classification. The
worker reads current versions and locks them again before classification writes.
