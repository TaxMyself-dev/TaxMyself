# Business reply mismatch diagnostics

- Read-only dev inspection: reply 1d3d2ceb-5443-4cef-8ff9-80aedf900f4a and document
  35c29e0c-78ad-414e-936b-a1743150ffe7. Original ngrok webhook matches persisted
  payload exactly; quote field is null in both. Label matches one choice, same
  sender/account/channel, document WAITING_FOR_BUSINESS with saved prompt ID.
- Add business.reply.match diagnostics for missing quote, zero/multiple matching
  pending questions, zero/multiple label matches, and a lost conditional update.
  Hebrew reasons and stable codes only; no labels, phone, owner or question values.
- Retain boolean selection API, exact matching and conditional update semantics.
  No fallback to most recent document and no real processing/replay for inspection.
- Future attempts emit the new diagnostic; historical logs remain unchanged.
- Only mocked tests and build during implementation. No live sends, DB writes,
  deployment, main integration or push.
- Verification: 44 mocked tests across reply diagnostics, intake and prompt suites
  passed, including privacy checks for all six rejection reasons; Nest build and
  diff checks passed.
