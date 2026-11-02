# Explain repeated business selections

User requested an explanation when an old question is clicked again. Continue
existing development-only outbound authorization; verification is mocked-only.
No real sends, app startup, data changes, deployment, main integration or push.

- After a choice fails to match a WAITING_FOR_BUSINESS document, transactionally
  look up the question by channel, normalized sender, account and WhatsApp question
  receipt. Require one document, a previously selected business and an exact saved
  button/menu label. Unknown, ambiguous, unrelated or foreign-account replies stay silent.
- Lock/read the original document but never update it, reimport, move or duplicate
  its file. First successful selection remains authoritative even during processing.
- Snapshot the selected business name/number and original document/question IDs in
  the reply row's existing business_choices JSON. Finalize only that leased reply
  as BUSINESS_LOCKED and stage its deterministic result notice in one transaction.
- Explain: the document was already assigned to the original business; resend to
  choose another business. Quote the original document, not another user's question.
  Same-choice and different-choice repeats receive the same truthful explanation.
- Recheck the original account/sender/channel, question, assignment and snapshot,
  then current unique account mapping/business ownership before sending. Cancel a
  changed context. Existing hashes, SQL leases, stable operation IDs, persisted
  receipts, unknown-send quarantine and persistence-only recovery prevent blind resends.
- One notice per incoming reply event. Re-delivery of that event does not create
  another notice; a new intentional click can receive its own explanation.
- No schema, migration, authentication-policy, accounting or cloud-proxy changes.
  No existing notification hashes or prompt routing mappings are changed.

Verification: 109 mocked tests passed across notification, intake, question-outbox
and reply-diagnostic suites; backend build and git diff --check passed. The first
test run could not write the default sandbox transform cache (zero tests ran);
the successful rerun used an isolated cache inside this worktree's node_modules.
Tests cover same/different repeat choices, source immutability, exact quote/name,
one notice per event, rollback, stale lease, owner/sender/quote/label mismatches,
ambiguous sources, waiting documents and assignment changes before delivery.
