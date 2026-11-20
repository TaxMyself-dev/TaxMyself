# Email document decisions

Current Gmail imports use the always-available durable intake in [gmail-intake-durable.md](gmail-intake-durable.md), superseding the earlier opt-in, ten-ambiguous-file reader experiment.

- Supported readable unresolved files reach the existing processor. All six relevant kinds use one classification-and-extraction response; keywords alone are not proof of relevance.
- Relevant records continue to existing user review. Uncertain or incomplete records remain ordinary pending review, without invented fields or special uncertainty tags.
- Only a complete valid explicit not_accounting response permits managed Drive deletion, with reference, owner, content and acknowledgement checks. The Gmail original remains untouched. Empty extraction, exceptions and timeouts do not authorize deletion.
- Password-required PDFs follow the protected-original / explicit-open-replacement lifecycle; unreadable/oversize inputs remain retained for attention.
- Pagination, durable identity/claims, bounded concurrency and saved-result recovery replace per-scan AI admission caps. No production feature flags are required. Diagnostic/legacy reader APIs retain their own bounds and are not the normal import endpoint.

See [main preparation](gmail-email-main-preparation.md) for current configuration and verification.
