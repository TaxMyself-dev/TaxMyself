# Lychee quoted reply environment routing

- User authorized local implementation only, no deployment/push/messages.
- Existing worktree TaxMyself-whatsapp, codex/whatsapp-integration.
- Proxy consults signed read-only reply-owner endpoints for quoted events.
  Allowlisted tester: query prod+dev and require exactly one owner. Other
  sender: prod only. Prompt owner overrides #dev; never default unknown reply
  to prod. 409 for unknown/ambiguous, 502 for unavailable lookup.
- Backend queries existing prompt column by channel+normalized sender+prompt ID,
  including completed documents. Added internal immutable recordPrompt method
  for the future send adapter. No sender or live prompt registration executed.
- Uses existing SQL table only, no schema/environment changes or credentials.
- Prerequisite: both receivers must have reply-owner deployed; ngrok must be
  up for test-phone quoted routing. Support prompt registry still separate work.
- Verification: proxy 16 offline tests passed; backend focused tests and build
  results recorded in chat. No live cloud/DB/provider calls.
