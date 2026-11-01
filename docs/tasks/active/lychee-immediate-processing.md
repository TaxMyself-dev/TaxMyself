# Immediate durable intake and question delivery

- Wake intake after successful durable enqueue (including duplicate deliveries).
  Acknowledgment does not await media download, Drive import or question sending.
- Wake prompt delivery only after the document/outbox transaction commits.
  The new injection is one-way intake -> prompt, with no provider cycle.
- Coalesced setImmediate signals retain pending wakes while busy, including a
  periodic tick overtaking a scheduled callback. Drain immediate bursts through
  fresh SQL claims; never reuse a job or bypass running flags, ownership checks,
  leases, retry timestamps, transport availability or uncertain-send quarantine.
- Existing 10-second polling remains unchanged as durable recovery backup.
  Shutdown cancels deferred wake callbacks. No new environment flags or schema.
- Correct misleading legacy waiting log: question is queued for delivery, not
  unimplemented. Readable wake failures defer to durable periodic recovery.
- Fake timers, fake SQL and fake transports only; no real sends, data changes,
  deployment, main integration or remote push during implementation.
- Verification: 51 mocked tests passed across immediate scheduling, intake and
  prompt services. Covered enqueue/transaction commit ordering, acknowledgment,
  duplicate events, busy/polling overlap, immediate question delivery, transport
  guard, uncertain-send quarantine and shutdown cancellation. Nest build and
  git diff --check passed.
