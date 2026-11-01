# Lychee business button request shape

- Fix the documented make-send-text buttons contract: [{text: label}] rather
  than string labels. No automation_id is attached; buttons only select a business.
- Builder snapshots and labels retain their meaning, ordering, 20-character
  limit and quoted source document. Menus for >3 businesses remain text-only.
- Normalize old string-array drafts into text objects only at the HTTP boundary;
  never mutate saved payloads/hashes or requeue quarantined questions. Redaction
  uses button.text and retains legacy string support.
- Tests mock all sends and databases: builder/API shape, label correspondence,
  immutable legacy normalization, sensitive button-text masking and outbox flow.
- No real send/resend, database changes, deployment, main integration or push.
- Verification: 57 mocked tests across four suites passed; Nest build and
  git diff --check passed.
