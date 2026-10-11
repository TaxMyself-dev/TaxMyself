# WhatsApp document intake development

- Status: `APPROVED`
- Task manager: current chat
- Worktree: TaxMyself-whatsapp
- Branch: codex/whatsapp-integration
- Base commit: 562b7855

## Business outcome

Build the first document-upload path in reviewable commits with runnable Postman checks.

## Acceptance criteria

- Explicit test-phone routing; unknown and ambiguous senders cannot import.
- Multiple businesses require selection and disallowed destinations are rejected.
- PDF/JPEG/PNG feed the existing importer with an explicit owner and business.
- Duplicate events and duplicate content do not create repeated successful imports.
- Failed uploads never return success; failed events can be retried.
- Postman collection, standalone local sandbox, focused Jest tests and Nest build.

## Scope and constraints

Development simulation first. No Meta access, schema changes, production access,
account-linking UI, customer-service bot, push, merge or deployment.
Use existing API_IMPORT source until WHATSAPP enum schema is separately approved.
In-memory event dedup is development only and resets on restart.

## Handoff

Pending implementation and verification.
