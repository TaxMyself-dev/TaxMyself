# Assistant QA demo dataset

- Status: COMPLETE (data and local verification; no main integration)
- Worktree: C:/Users/user/Keepintax/TaxMyself-assistant-demo-data
- Branch: codex/assistant-demo-data
- Base: 96adf464 (local main; origin/main was 91d5bf27 at inspection)
- User authorization: create a dedicated dev demo with linked documents and expected answers, preserve existing data; no main integration or push.

## Acceptance
- Additive dedicated Firebase identity and two fictional businesses on keepintax-dev only.
- Customers, suppliers, expenses with real classifications, pending/private states, bank/card fixtures, linked source PDFs and issued income documents.
- Validate reports and links, record deterministic questions and expected answers.
- No schema synchronization, boot catalog writes, cron workers, live banking, email or charges.
- Refuse an existing identity not owned by the local run manifest; no reset endpoint.
- Preserve existing rows; retain digest comparison evidence locally, excluded from Git.

## Constraints and inspection
- Root, demo-data, expenses documentation and accounting redesign decisions read.
- Main index reported corrupt during read-only status; not repaired or modified. Worktree creation succeeded and this worktree has its own index.
- Copied primary backend/.env and verified it is ignored. Other named root/agent/frontend .env sources were absent; no credentials invented.
- Independent npm ci completed (1161 packages); no shared node_modules.
- Initial read-only DB preflight confirmed keepintax-dev, unused email and existing system classifications.

## Verification / delivery

- Created demo+assistant-qa@keepintax.local, Firebase UID nVae49mBOFRLzhUJlLm70ngpBeG3, on keepintax-dev only.
- 2 businesses, 4 clients, 23 expenses (20 journalled, 2 pending, 1 private), 24 supplier PDFs, 7 issued income documents with PDFs/lines/payments, 32 bank/card transactions, 24 classified slim rows.
- Source PDF -> extracted document -> expense and transaction links checked; pending/private source back-pointers reconciled without creating journals.
- Password generated and rotated on only this new identity. Credentials live exclusively in ignored .local/assistant-qa/login.txt and manifest.json. Automatic review rejected placing a password in tracked docs; the safer implementation removes it from both profile source and documentation. No action remains blocked by that review.
- Every pre-existing business, expense, document, client, supplier, transaction and journal record in the 11-table baseline compared unchanged. One pre-existing user row (index 4) changed fName during the run. The seed has no identified write path to that old name; cause not proven. It was not reverted, preserving possible concurrent work. No claim that every user row stayed identical.

Exact checks:
- npm ci --no-audit --no-fund: exit 0, 1161 packages, existing dependency deprecation warnings.
- node -r ts-node/register -r tsconfig-paths/register scripts/generate-assistant-qa-pdfs.ts: 24 supplier PDFs created. Seven income PDFs created by the seed. Representative source/income PDFs rendered with pdftoppm and visually inspected; harmless missing fallback font notices, no visual defects observed.
- npx jest src/demo-data/profiles/assistant-qa.profile.spec.ts --runInBand: 3/3 passed initially.
- npx jest src/demo-data/profiles --runInBand: initial 25/26; the fixed allowlist omitted the new synthetic profile. Added assistant-qa to that explicit allowlist (no weakened assertion).
- npx jest src/demo-data/profiles/direct-card-demo.profile.spec.ts src/demo-data/profiles/assistant-qa.profile.spec.ts --runInBand: 16/16 passed.
- Final npx jest src/demo-data/profiles --runInBand: 5 suites, 26/26 passed, 17.324 seconds.
- Final npm run build: exit 0.
- Final npx tsc -p scripts/tsconfig.assistant-qa.json: exit 0.
- node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/seed-assistant-qa.ts --verify --files: exit 0; all 31 actual remote PDF downloads and password login passed.
- --apply on a completed manifest: reused existing fixture, counts unchanged; performs verification instead of reseeding.
- ASSISTANT_QA_AGENT_ROOT=C:/Users/user/Keepintax/TaxMyself-new-ai-assistant with --verify: real AgentDomainService at f9b46bcf read the data; main fuel 2360, monthly 354/590/826/590, combined 3068, BUSINESS_REQUIRED with neither active nor explicit business. Evidence in ignored agent-tools-verification.json. Final added assertions were checked against that persisted output; no executable data changes afterwards.
- No paid model eval, browser conversation, production changes, email, bank provider sync, charges, schema synchronization or cron worker executed.
- Backend build and tests cover the final profile; script typecheck covers final seed. Runtime data/file verification preceded the final assertion-only and optional source-location additions. Distinguish this from a full application/UI end-to-end test.

Documentation: docs/operations/assistant-qa-demo.md contains login-file location, dataset inventory, approximately 25 prompts and expected results, commands and limitations. backend/src/demo-data/AGENTS.md documents the special CLI path.

No main integration or push authorized. Local feature commits permitted. The assistant feature branch may receive the isolated demo commit so its running backend recognizes syntheticOpenBanking; preserve its pre-existing untracked drafts and timing file.
