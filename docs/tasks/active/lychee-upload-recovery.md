# Recover uploaded files before import ledger persistence

- Shared DocumentImportService: retain existing user/business/hash SQL dedup.
  Resolve owner-scoped business folders, inspect inbox/processed, prefilter by
  MD5 and size and verify actual downloaded SHA-256 before adopting a Drive file.
- Reuse actual file ID/name/folder for ledger persistence, without another upload.
  Preserve recovered files across DB errors and concurrent ledger insertion.
  Fresh-upload DB failure still performs existing best-effort compensation.
- Recovery handles an interrupted process and a failed compensating delete;
  existing ledger fast path handles interruption after ledger commit. Existing
  physical duplicates are neither deleted nor otherwise modified by this change.
- No schema change. Additional folder-list work applies to ledger misses;
  downloading occurs only for checksum/size candidates. Errors during inspection
  stop the attempt rather than blindly upload. This does not introduce a
  distributed lock for simultaneous initial uploads; existing SQL uniqueness and
  fresh-upload loser compensation remain in place.
- All tests use in-memory SQL/Drive doubles only. No actual data access, repair,
  uploads, deletes, deployment, main integration or push during implementation.
- Verification: 12 recovery/cleanup tests passed, including process interruption,
  processed-folder adoption, false checksum candidates, DB failures, failed
  compensation, concurrent ledger winner and owner isolation. Nest build and
  git diff --check passed.
