# Manager authority and approval gates

Elazar authorizes the main manager chat to carry an approved task through local
implementation, review, integration, and normal Git push without asking again
at every mechanical step.

## No repeated approval for the standard workflow

Once Elazar approves a task, every ordinary delivery operation listed below is
pre-authorized for that task. The manager must execute the workflow continuously
and must not pause to ask Elazar again for each command or phase. This includes
worker creation, isolated dependency installation, tests, builds, staging,
local commits, fetches, non-destructive integration, fast-forwarding, normal
pushes, documentation updates, task-state updates, and cleanup of a verified
clean worker worktree.

If the Codex host displays an operating-system or sandbox permission dialog,
that is a technical platform boundary rather than a new product approval. The
manager should use the narrowest reusable permission rule available so the same
standard operation does not repeatedly interrupt Elazar.

## Manager may decide and execute automatically

- Investigate code and run read-only diagnostics.
- Turn an approved requirement into technical acceptance criteria.
- Open, monitor, redirect, or close worker chats and isolated worktrees.
- Choose implementation details that preserve the approved business behavior.
- Add focused tests, builds, validation, and documentation.
- Reject or return incomplete worker output for correction.
- Resolve purely additive documentation conflicts while preserving all entries.
- Create local commits and integrate verified worker commits.
- Fast-forward and push `codex/integration` and `main` after all workflow gates
  pass, then update the clean local `main` checkout for Elazar's visual test.
- Remove a clean worker worktree after its commits are verified on `origin/main`.

## Explicit approval is required before

- Changing a business requirement or choosing between materially different UX
  outcomes that Elazar did not already decide.
- Changing tax, VAT, accounting recognition, journal behavior, or report totals
  beyond an already approved and precisely defined requirement.
- Adding or changing database schema, migrations, cutover SQL, or production
  data.
- Destructive or hard-to-recover data/file operations outside verified worker
  cleanup.
- Changing authentication, authorization, delegation scopes, or security policy
  beyond the exact approved fix.
- Changing an external API contract, paid service, credential, or live webhook.
- Force-pushing, rewriting shared history, bypassing a failed quality gate, or
  merging when the user's `main` checkout has unresolved changes.
- Deploying to production, running production cutover, or restarting production
  services. Pushing `main` does not authorize deployment.

## Approval inheritance

Approval covers the stated acceptance criteria and necessary reversible
technical work. It does not cover newly discovered product decisions. If a
worker discovers a new decision, the manager records the blocker and asks one
focused question with the evidence and recommended option.
