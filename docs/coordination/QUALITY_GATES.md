# Quality gates

No change reaches `main` until the primary integration manager records evidence
for every applicable gate below. A worker report is evidence to review, not a
replacement for manager verification.

## Every task

- Acceptance criteria are explicit and unchanged, or scope expansion was approved.
- The complete diff and `git show --check` were reviewed.
- No secrets, `.env` files, dependencies, build output, caches, or temporary
  evidence are committed.
- Focused tests cover the changed behavior and actually executed successfully.
- Documentation matches the resulting behavior.
- Schema, production, security, accounting, and external-contract impact is
  stated explicitly, including `none` when applicable.

## Risk-based test selection

Choose the smallest test set that can fail because of the staged change. Test
selection follows the changed behavior and dependency boundary, not the size of
the containing feature module. Record the selected tier and why broader suites
were or were not applicable.

| Change tier | Required verification | Do not run by default |
| --- | --- | --- |
| Documentation only | Documentation gates below. | Application tests and builds. |
| Local presentation only | Review the template/style diff; run the nearest isolated component/template test when one exists; run the frontend production build. If no such test exists, record a static assertion/search plus the required visual check. | Unrelated flow, service, table-consumer, or module-wide suites. |
| Component behavior | Run the changed component's isolated tests and the frontend production build. Add direct consumer tests only for changed inputs, outputs, routing, or state contracts. | Every test in the feature module merely because the component lives there. |
| Shared component or shared style | Run the shared component tests, representative critical-consumer tests for each affected usage pattern, and the frontend production build. | Every consumer when representative coverage proves the unchanged contract. |
| Frontend service, state, guard, or routing | Run the directly affected service/state/guard/route tests, tests for changed public consumers, and the frontend production build. | Presentation-only suites that do not exercise the changed contract. |
| Backend service/controller/domain | Apply the backend gates below to the changed behavior and its direct callers. | Repository-wide Jest unless the change crosses shared infrastructure or an isolated runner is unavailable. |
| Build configuration, dependency, generated contract, or shared infrastructure | Run the affected package build and the narrow regression/smoke suites that consume that boundary; broaden when isolation is not reliable. | A narrow component-only test as the sole evidence. |

`Local presentation only` means HTML/SCSS or a static presentation binding
whose TypeScript behavior, public component contract, shared/global style,
accessibility interaction, and conditional visibility are unchanged. A change
to event wiring, disabled/hidden conditions, dynamic classes, shared selectors,
or a reusable component moves to the appropriate higher tier.

Do not inflate coverage counts by running an umbrella `tsconfig` or glob that
loads unrelated specs. When a runner unexpectedly executes broader tests,
record the actual count, correct the selector for future runs, and do not treat
the accidental breadth as the new minimum gate.

## Backend changes

- Run focused Jest tests for changed services/controllers.
- Run the Nest build.
- For database behavior, verify transaction boundaries, tenant/business scope,
  authorization, and failure atomicity.

## Frontend changes

- Select focused tests using the risk-based matrix above. Purely local
  presentation changes do not require unrelated behavioral suites.
- Run the Angular production build.
- Record broad-suite legacy failures accurately; never report an unexecuted or
  compilation-blocked test as passed.

## Documentation-only changes

- Run the repository Markdown-link check and `git diff --check`.
- Verify instruction discovery: one root `AGENTS.md`, correctly named nearest
  topic files, and no conflicting root instruction file.
- Application tests/builds are not required when no executable or configuration
  file changed; record that determination instead of claiming they passed.

## Integration

- Integrate one task at a time on current `origin/main`.
- Re-run the selected risk-based checks on the integrated tree. Fast-forwarding
  the exact tested commit does not broaden the required test tier.
- A conflict in code meaning requires renewed semantic review.
- A suspected pre-existing failure must be reproduced on the recorded base.
- Verify the intended commit on local `main`, `origin/main`, and
  `codex/integration` after push.
