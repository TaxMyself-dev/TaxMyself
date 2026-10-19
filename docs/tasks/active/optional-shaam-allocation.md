# Optional SHAAM allocation during invoice issuance

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worker: Codex
- Worktree: primary checkout
- Branch: `main`
- Base commit: `d4f35c3e` (tab migration committed immediately beforehand)

## Business outcome

Users issuing a tax invoice or tax invoice-receipt at or below the applicable
allocation threshold may optionally request a SHAAM allocation number, while
the existing mandatory above-threshold flow remains unchanged.

## Acceptance criteria

- [x] Tax invoices and tax invoice-receipts at or below the threshold show an unchecked “בקש מספר הקצאה מרשות המסים” option when no allocation number exists.
- [x] 4,999 ILS and exactly 5,000 ILS issue normally when the option is unchecked and enter the existing SHAAM flow when checked.
- [x] 5,000.01 ILS retains the existing mandatory flow, warnings, and continuation choices with no voluntary option.
- [x] Other document types never show the voluntary option.
- [x] A voluntary request without the recipient business/tax number is blocked with wording appropriate to an optional request.
- [x] A voluntary request persists the invoice as `PENDING_ALLOCATION` before the Approval call and reuses the existing finalization path.
- [x] Ambiguous failure/timeout leaves the persisted document pending and does not issue another Approval request.
- [x] Successful allocation is persisted and rendered in the PDF without changing numbering, journal posting, or the mandatory path.
- [x] The voluntary choice resets on document-type change, business change, draft restoration, and successful/reset issuance.

## Scope and constraints

- In scope: `frontend/src/app/pages/doc-create/` UI, state, orchestration tests, and topic documentation.
- Out of scope: allocation threshold policy, backend contracts/schema, SHAAM authentication/security work, KT-019, accounting logic, deployment.
- Required reading: root `AGENTS.md`, `docs/coordination/WORKFLOW.md`, `AUTHORITY.md`, `QUALITY_GATES.md`, `LESSONS.md`, and `frontend/src/app/pages/doc-create/AGENTS.md`.
- Approval boundaries: do not change `getAllocationNumberThreshold()`, above-threshold copy/behavior, numbering, journal logic, schema, or external API contracts.

## Handoff

- Result: complete; optional allocation reuses the existing persisted SHAAM flow while the mandatory path remains unchanged.
- Commit hash(es): feature commit containing this task record; preceding tab fix `d4f35c3e`.
- Changed files: doc-create component TS/template/SCSS, focused request spec, topic documentation, and this task record.
- Tests and exact results: focused ChromeHeadless spec `19 SUCCESS`; Angular production build succeeded.
- Known pre-existing failures: none. Build retained existing bundle/SCSS budget and CommonJS warnings.
- Schema / production / security / accounting / external impact: no schema, backend contract, threshold, security, numbering, journal, or deployment changes.
- Risks and manual checks: live SHAAM was not called; automated coverage verifies orchestration up to the existing service boundary.
- Documentation updated: `frontend/src/app/pages/doc-create/AGENTS.md` and this task record.

## Integration

- Reviewed by:
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
