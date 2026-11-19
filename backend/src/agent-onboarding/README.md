# Agent onboarding

## Behavior

The development agent page offers a first-visit dialog and a permanent link to
`/dev/agent/onboarding`. The new page supports free narrative, guided questions,
explicit skips, a preview before saving, current stories, basic field status,
history, corrections and scoped forgetting. Multi-business users choose an owned
business explicitly. The field list is the initial configurable implementation
of the specification, not a claim that product field selection is final.

Personal facts (preferred name, parallel employment, current need and open
personal narrative) have one owner-scoped profile with empty `scope_key`.
Business facts have a separate profile keyed by the owned business number.
Changing a business does not copy personal facts or mix business stories.
The initial registration is seeded from existing application data when available;
onboarding never writes the accounting Business entity or changes tax reports.

## Storage and update contract

Apply `backend/scripts/migrations/2026-11-19_agent_onboarding.sql` manually to an
authorized isolated development database first. The script creates five new
InnoDB tables and does not alter existing accounting tables. There are no ORM
entities for these tables, so TypeORM synchronization cannot create them.
They are not in the generic agent gateway registry: all access is through the
owner-scoped Nest service with parameterized SQL.

Profiles have predefined nullable text columns, JSON field states and a
MEDIUMTEXT story. Facts are open-ended rows with source evidence, scope,
recording time, effective date text, precision and replacement links. Dates are
stored as YYYY-MM-DD or YYYY-MM, never a fabricated day. Prior validity ends
at the transition boundary; end boundaries are exclusive at the stated
precision. Uncertain transition days remain uncertain.

The story is currently a deterministic composition of all active narrative
facts, rather than a second lossy model rewrite. Original user narrative is
retained in the source change log. Historical superseded and corrected facts
remain separate and are included in ordinary chat context with status labels.

POST propose extracts only evidence-backed changes and persists an opaque
server-side proposal for 30 minutes. The browser cannot supply facts to commit.
Transitions without a needed date are withheld and converted to a clarification
while retaining the original message for the next answer. Workplace modes are
structured to preserve simultaneous home and office work. Explicit corrections
can also invalidate disproved historical facts without pretending there was a
real transition.

POST commit locks profiles in deterministic order and then the proposal, checks
both personal and business versions and atomically writes facts, current fields,
story versions and conversation changes. Concurrent stale edits return 409.
Applied proposal retries do not duplicate writes. No model/network call runs
inside a database transaction.

Forgetting removes the selected fact's replacement chain (or all history of its
basic field), associated old story versions and affected source text/proposal
payloads. It rebuilds the current story and discards unapplied owner previews.
Other facts remain. A forgotten basic field is marked skipped to avoid asking
for it immediately again. Ordinary chat transcripts and backups are explicitly
outside this deletion action; the UI states that limitation.

## API and authorization

All `/api/agent-profile` routes use FirebaseAuthGuard and the existing domain
business ownership check. Profile reads/writes are self-service only: delegates
and admin impersonation cannot read or change someone else's personal profile.
This adds no new delegation permission. Ordinary chat requests receive profile
context through an optional verified-owner domain callback. The latest context
replaces previous context; it is not accounting evidence or an instruction.
Ordinary chat does not start onboarding or fill gaps automatically. Profile
updates use the dedicated onboarding conversation, not the old generic memory
tool as a second profile store.

- GET businesses: owned business directory.
- GET profile with businessNumber: current state, facts, history and questions.
- POST propose: message or explicit skip, businessNumber and both versions.
- POST commit: businessNumber and opaque proposalId only.
- POST defer: remember dismissal of the first-visit invitation.
- POST forget: factId, businessNumber and both versions.

## Local activation

Set `AGENT_ONBOARDING_ENABLED=true` only after the new SQL is applied to the
intended development database. Disabled onboarding does not query its tables
from ordinary chat. Extraction uses the existing OPENAI_API_KEY with
`store:false`, structured output and a 60-second timeout. Optional
AGENT_ONBOARDING_MODEL defaults to gpt-4.1-mini. No key is committed.

Build backend, backend/agent and frontend independently using npm. Use a distinct
frontend/backend port pair for this feature checkout; the page accepts the same
validated localhost `?api=` override as the development agent. Production builds
keep both development routes disabled. Background accounting reviews are not
implemented by this feature.

## Verification

Backend unit/access checks: `npm test -- --runInBand --runTestsByPath
src/agent-onboarding/onboarding.domain.spec.ts
src/agent-onboarding/onboarding.service.spec.ts
src/agent-onboarding/onboarding.mysql.spec.ts
src/agent-harness/agent-harness.controller.spec.ts
src/agent-harness/agent-harness.access.spec.ts`.

MySQL integration tests require ONBOARDING_TEST_MYSQL_URL pointing only to a
disposable local database named onboarding_test; without it they explicitly
skip. Never point them at a real account database. They cover history, retries,
version conflicts, cross-owner isolation and forgetting.

Frontend browser checks: `npm test -- --watch=false --browsers=ChromeHeadless
--include=src/app/pages/agent-onboarding/*.spec.ts
--ts-config=tsconfig.onboarding-spec.json`.

Run Nest and Angular production builds; run agent typecheck, check, unit tests
and build. Exact results, skips and outstanding activation checks belong to
the feature task record. Retention/cleanup jobs, profile retrieval optimization,
background review scheduling and a full erasure policy remain separate work.
