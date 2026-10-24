# KT-095 - Document discount calculation and PDF detail

- Status: `WORKER_COMPLETE`
- Task manager: Codex, current chat
- Worker: Codex, current chat (no delegated worker)
- Worktree: `C:/Users/harel/Elazar Harel/taxmyself/taxmyself-dev`
- Branch: `main`
- Base commit: `f7ff2e4c419f8b4eca4cfbab358cca80d83cd4da`

## Business outcome

VAT-inclusive line discounts produce a document total consistent with the line,
and generated PDFs visibly explain both document and line discounts.

## Acceptance criteria

- [x] A VAT-inclusive price of 1,180 with a discount of 118 at 18% produces a
      net discount of 100 and a final document total of 1,062.
- [x] EXCLUDE and WITHOUT discount calculations retain their existing correct
      totals.
- [x] PDFs for all supported document and business types show the amount before
      discount and the discount when the discount is positive.
- [x] PDF item rows expose the line discount and show the line total after it.
- [x] Mixed taxable/untaxed summaries separate the after-discount taxable and
      untaxed portions and credit invoices include the untaxed row.
- [x] Focused backend tests and relevant builds pass; the isolated frontend
      bundle compiles, with the local Chrome launch limitation recorded below.
- [x] No commit was created until Elazar reviewed the changed files and
      explicitly approved committing them.

## Scope and constraints

- In scope: frontend document discount aggregation; backend PDF summary and item
  transforms, including mixed taxable/untaxed detail; focused regression tests;
  topic documentation.
- Out of scope: schema/data migration, production access or deployment,
  rewriting already-issued signed PDFs.
- Required reading: root instructions; `docs/coordination/WORKFLOW.md`;
  `docs/coordination/AUTHORITY.md`; `docs/coordination/QUALITY_GATES.md`;
  backend documents and frontend doc-create topic instructions.
- Approval boundaries: user explicitly approved the calculation and PDF display
  corrections and requested no commit before reviewing the changed files.

## Handoff

- Result: implementation complete and approved by Elazar for a local commit.
- Commit hash(es): pending this commit
- Changed files: frontend discount aggregation/test/topic doc; backend PDF
  transform/template/tests/topic doc/visual fixture; PDF-service smoke/layout
  fixtures; this task file.
- Tests and exact results: backend focused Jest 2 suites / 98 tests passed
  again immediately before commit;
  backend Nest build passed; Angular production build passed with existing
  style/initial-bundle/CommonJS warnings; PDF template compilation passed using
  the backend TypeScript toolchain; CJS fixture syntax checks passed;
  `git diff --check` passed. Focused Angular test bundle compiled, but the local
  Chrome 155 GPU process crashed before capture; an isolated no-GPU retry also
  failed during Chrome startup, so its three assertions did not execute.
- Known pre-existing failures:
- Schema / production / security / accounting / external impact: no schema,
  production, security or API-contract change. Corrects the persisted net
  discount and therefore the document/journal/allocation amounts for future
  VAT-inclusive documents; existing issued documents are not rewritten. The
  mixed-VAT correction changes PDF detail only, using existing line amounts.
- Risks and manual checks: manually preview 1,180 inclusive / 118 discount / 18%
  and confirm net discount 100, VAT 162 and final 1,062. A mixed-document PDF
  fixture was rendered to A4 PNG and visually confirmed: taxable 900 + untaxed
  300 + VAT 162 reconciles to 1,362, with unclipped five-column item rows and six
  aligned summary rows. Repeat the same check through the running UI.
- Documentation updated: backend documents and frontend doc-create topic docs.

## Integration

- Reviewed by: Elazar (visual review and explicit commit approval)
- Integrated commit:
- Combined verification:
- `origin/main` verification:
- User-visible run instructions:
