# Primary manager state

Last reviewed: 2026-09-18

## Integration baseline

- Main baseline incorporated before KT-016 integration: `0bdbfc15`
- Manager branch: `codex/integration`
- Production access: disabled by standing decision.

## Active work

- `KT-009`: Gmail forwarding-verification delivery is on `origin/main`; waiting
  for final user validation before archival.
- `KT-012`: repository Markdown and development-instruction architecture cleanup
  is approved, verified, and delivered through integration commit `8a54f63c`.
- `KT-015`: reports endpoint authorization hardening is verified and delivered
  through integration commit `7b183989`.
- `KT-016`: unified admin catalog tabs and SYSTEM-card creation are verified and
  delivered to `origin/main` through `bb784bae`.
- `KT-017`: admin educational-content pilot with the first three self-employed
  guide slides is verified and delivered to `origin/main` through `5cd8012b`.
- `KT-018`: refined self-employed guide opening sequence is verified and
  delivered to `origin/main` through `5a099fb2`.
- `KT-019`: VAT report attachment parity for manual and Drive source files is
  verified and delivered to `origin/main` through `8f1078ce`.
- `KT-023`: the Tax Authority compliance knowledge base is manager-reviewed and
  ready for delivery through documentation commit `3e0997f3`; it contains 11
  checksum-verified official PDFs, a requirements matrix, prioritized gaps, a
  verification plan, and SHAAM reconciliation. No application code, schema,
  production access, or live external request was involved.

## Pending integration

- KT-027 and KT-028 passed combined verification and were pushed to `origin/main` through `be15a03c`. The standing local `codex/integration` branch contains unrelated, undelivered CI work (`bf682e70`), so these fixes were integrated on `codex/integration-kt027-kt028` without that change. No production deployment was performed.
- KT-029 fixes admin SYSTEM sub-category card reassignment and save feedback. Worker and clean integration trees are identical (`6d717f76`); focused Jest and both production builds passed. Integrated as `bb28cfc1` on `codex/integration-kt029` because the standing `codex/integration` branch still contains unrelated, undelivered CI work. Pushed to `origin/main` through `c00c8abb`; no production access or deployment was performed.
- KT-030 adds admin creation of SYSTEM expense sections with an editable, suggested free block code. Worker commit `f4034f80` passed 48 focused Jest tests, five final section-specific tests, and both builds. It is staged on `codex/integration-kt030`; the standing `codex/integration` branch still contains unrelated, undelivered CI work. No schema, production access, or deployment is involved.

## Open decisions

- Add the second developer's shared profile after their name, role, and owned
  areas are supplied.
- None affecting the documentation architecture. The second developer's
  profile can be added later without changing the shared workflow.

## Next step

Review the P0 compliance findings with an Israeli accountant/tax adviser and
the relevant legal/security reviewers before approving implementation tasks.
No production deployment was performed.
