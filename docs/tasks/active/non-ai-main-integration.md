# Approved non-AI local main integration

- Status: `IN_PROGRESS`
- Date: 2026-11-15
- Manager: current Codex chat; no workers delegated.
- Integration branch: `codex/non-ai-main-integration`
- Original local main: `96adf4643e91ebdb4090259308d06c46d493e2eb`
- Refreshed origin/main: `66c11cbc` (preserve current billing fixes).

## Scope and acceptance

Elazar explicitly requested merging the remaining changes except AI, after
excluding legal consent, WhatsApp support and PDF timing diagnostics. Integrate
subscription pricing (backend and UI), new personal/subscription settings,
browser update banner, and guarded background Enter login. The old uncommitted
PDF renderer experiment is not part of this integration. AI/demo branches stay
outside main. No remote push, deployment, provider calls, or database changes.

- Preserve existing local-main commits and current remote-main fixes.
- Keep original feature worktrees and their local edits intact.
- Include the settings page's local family-heading correction; exclude local
  frontend start port and API port configuration.
- Resolve pricing conflicts without losing multi-period recovery, hosted
  initial-checkout resume, payer-profile validation, or no-charge activation.
- Run combined mocked billing/signup/admin-guard regressions and Nest build.
- Run focused settings, pricing, login and PWA tests and Angular production build.
- Fast-forward local main only after verification, preserving untracked local files.
- Record exact revisions, commands, results and limitations here.

## Setup

The original main Git index began with zero bytes and was unreadable. Preserved
it as `.git/index.corrupt-backup-20261115`, reconstructed an alternate index from
HEAD, and confirmed no tracked working-file changes before replacing the index.
Only existing untracked `.codex-remote-attachments/` remains in the main checkout.
No tracked files were changed by index repair.

Created a separate worktree and copied ignored `backend/.env` without displaying
its contents. Backend `npm ci --no-audit --no-fund` succeeded. Frontend `npm ci`
failed on the existing missing `encoding` lock entry; installing independently
without changing the tracked lockfile. No dependency directories are shared.

## Verification

Pending final combined results. No checks are claimed as passing yet.
