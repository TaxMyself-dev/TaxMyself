# Lychee intake rejection explanations

User requests specific failure replies instead of silent document rejection.
Continue existing WhatsApp worktree from local main 978ea5ca. Mock verification
only; no live sends, database/cloud changes, main integration, deployment or push.

Account ambiguity, absent signup phone, changed account mapping, unsupported
message media and rejected quoted business selections stage fixed explanations.
No account or business data is included in phone-only failure drafts. Parent
reconstruction, hash, channel, normalized sender, quote and transport deployment
identity remain required. Success and business-specific notifications retain
their existing ownership checks. Rejection text never chooses an account.

Terminal rejection and notice commit atomically using existing intake columns.
New statuses fit the existing VARCHAR; no schema or environment changes.
Notice IDs remain deterministic; known receipts recover persistence only and
UNKNOWN delivery never blindly resends. Existing completed rows are not replayed.

Boundaries: unauthenticated/invalid webhooks and invalid recipient phones cannot
safely receive replies. Temporary processing failures retry before final failure.
Provider/DB outages, unknown-send quarantine and CPU throttling can still prevent
or delay delivery; this work cannot guarantee every failure reaches WhatsApp.
Prompt preflight cancellation/unknown delivery still requires operational review;
this change addresses intake terminal rejections, not prompt delivery recovery.

Verification: 17 suites / 247 mocked tests passed, including atomic rejection
rollback, one simulated send per rejection, safe parent reconstruction, no
account lookup for phone-only failures and unchanged success ownership checks.
Diff check and backend build passed. The sandboxed build session did not report
completion clearly; the repeated elevated local npm run build exited 0.
No live messages, database/cloud changes, deployment or push were performed.

Subsequent user-approved main integration on 2026-11-04 is recorded in
docs/tasks/active/lychee-spouse-phone.md. The no-deploy/no-push boundary remains.
