# Preserve local features while syncing current remote main

- Status: `IN_PROGRESS`
- Date: 2026-11-18
- Manager: current Codex chat, single agent.
- Existing worktree/branch: TaxMyself-non-ai-main-integration /
  `codex/non-ai-main-integration`.
- Initial local main: `05a87b662ef87dbb214f1745285091425ba6c45b`.
- Refreshed remote main: `11c829b2`.

## Authorization and acceptance

Elazar wants to deploy and requested alignment with remote. Preserve all four
previously integrated non-AI features and the mobile-table performance fix,
integrate current remote updates in isolation, verify the combined code, and
fast-forward local main. No reset, history rewrite, remote push or deployment.
Push still requires the owner's personal test of the resulting main revision
and explicit push approval under his personal AGENTS.md gate.

- Preserve local features and ignored environments/untracked files.
- Include KT-113/114 checkout-resolution safety and KT-115 deferred allocation
  accounting from current origin/main.
- Preserve local LIVE/FROZEN/CUSTOM pricing, zero-price activation and current
  payment recovery while resolving checkout imports.
- Run a bounded diagnostic on checkout/pricing/documents first, then combined
  billing/document backend regressions and affected frontend suites/builds.
- Record exact commands, revisions, failures/skips and final local state.
- No live provider, database, schema, production or cloud operation.

## Setup and review

Initial state: 31 local-only and 9 remote-only commits after fetch. Local tracked
files were clean, with only existing untracked .codex-remote-attachments/.
Continued the existing clean integration worktree with its independent installed
dependencies and ignored environment; no environment overwritten or dependency
tree shared. Remote changes do not alter package manifests or lockfiles.

The only textual conflict is the billing service import block. Keep both local
zero-price/date helpers and the new hosted-completion service. Review automatic
merge paths for preservation of APPLIED checkout status and pricing fingerprints.
Remote KT-115 posts pending-allocation journals at initial persistence and reuses
their link at finalization; mappings, amounts, thresholds and schema stay unchanged.
Existing topic documentation and the master redesign plan govern this behavior.

## Verification and delivery

Pending. No claim of a passing final revision or deployment readiness yet.
