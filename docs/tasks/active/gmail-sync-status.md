# Gmail latest pull and processing status

- Status: `WORKER_COMPLETE`
- Task manager: Codex
- Worktree: isolated Gmail status feature checkout
- Branch: `codex/gmail-sync-status`
- Base commit: `406e921d99def346ffa4741cb610b5c8d24353df` (`codex/gmail-business-routing`, explicitly requested)

## Acceptance criteria

- [x] Replace historical run cards with active work and one latest-run disclosure per mailbox.
- [x] Keep pull and document processing stages separate, including completion notifications.
- [x] Ordinary disclosure contains only pull status, processing status, message count and file count.
- [x] Full diagnostics stay inside the disclosure and require development tools.
- [x] Later successful pulls supersede older errors; newer failures and tenant boundaries remain protected.
- [x] Investigate the displayed error and remove it only if later success proves it obsolete.

## Diagnostic finding

Read-only inspection of the two screenshot mailboxes in keepintax-dev on
2026-11-23 found that mailbox 17's latest run started at 01:24:39 UTC that day
and remained PARTIAL / ATTENTION with CONFIG. Successful pulls were older.
The persisted account error was therefore retained; no database data was changed.
The user explicitly requested this inspection, overriding the local default
against live database access for this narrow diagnostic only. No Nest startup,
provider calls, imports, AI work or file deletions were performed.

## Verification and handoff

- Frontend focused tests: 23 passed on the consolidated executable changes.
- Backend focused batch: 38 tests passed across the three documented suites. The final newer-manual-run guard changed only UserIntegrationsService; its affected 15-test suite was rerun and passed. The unchanged intake and status test evidence is reused; this is not a full 38-test run after that last guard.
- Frontend production build: passed on final frontend source. Earlier production build overlapped template changes and is not the final evidence.
- Backend Nest build: passed on final backend source. An earlier final build failed with TS5033 / ENOSPC; removed only generated frontend/.angular/cache, frontend/dist and backend/dist in this worktree (about 1.09 GB), then reran the exact Nest build command successfully. No source or other worktrees were removed.
- Exact commands: see the feature document; the final affected backend rerun used `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/integrations/services/user-integrations.service.spec.ts`.
- `git diff --check`: passed. Complete implementation/test diff reviewed.
- Production build warnings: initial bundle 3.21 MB exceeds the 2 MB warning threshold; component style warnings include Gmail at 6.38 kB versus its 6 kB warning threshold (below the 16 kB error threshold). CommonJS optimization warnings also remain. No build failures.
- No live import/AI or manual end-to-end mailbox run: intentionally skipped. Browser component tests exercised the rendered collapse and development-only visibility.
- Initial backend diagnostic run: 37 passed; it overlapped subsequent changes and is not final-revision evidence.
- Schema / production / security / accounting / external contract changes: none.
- Broader suites: omitted under the risk-based quality gates; changes are confined to Gmail status boundaries.
- Existing dependency engine/deprecation and Angular reactive-form warnings were observed.
- Documentation: [feature behavior and exact commands](../../features/gmail-sync-status.md).
- Main integration and GitHub push remain subject to the user's separate approval gates.
