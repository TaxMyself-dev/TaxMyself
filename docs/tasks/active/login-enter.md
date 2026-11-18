# Login Enter submission

- Status: `INTEGRATED_LOCAL`
- Task manager: current Codex chat
- Worktree: isolated codex/login-enter
- Base commit: df7fd270f793e2cf77bf262c6def4cc1c1719907

## Acceptance criteria

- [x] Login is the form's native submit button, enabling Enter from either credential input.
- [x] Clicking login uses the same ngSubmit path exactly once.
- [x] Invalid forms and ongoing login attempts cannot start another login.
- [x] Password reset remains a separate action.

## Handoff

- Shared button forwards its type with button as the unchanged default; login uses submit and removes its duplicate click handler.
- login() rejects invalid forms before authentication.
- Topic documentation and focused tests updated.
- Focused ChromeHeadlessLocal tests: 9/9 passed. Command: node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadlessLocal --karma-config=karma.login-check.cjs --include=src/app/components/button/button.component.spec.ts --include=src/app/pages/login/login.page.spec.ts --ts-config=tsconfig.login-check.json
- Angular production build passed: node node_modules/@angular/cli/bin/ng.js build --configuration=production. Existing bundle/style budget and CommonJS warnings remain.
- git diff --check passed.
- Environment: npm ci failed on a missing encoding lockfile entry, npm install encountered Windows EPERM errors. Used a separate physical copy of installed frontend dependencies, without junctions/symlinks or modifications to the user's dependency tree. Default ChromeHeadless launch failed; a local headless launcher with --no-sandbox succeeded. This flag applies only to the test browser.
- No tracked package or lockfile changes.
- Schema / production / security-policy / accounting / external-contract impact: none.
- No live authentication request was made. A real Enter login remains a manual smoke check after integration.

## Integration

Integrated onto local main from base 0b0a4e41d48917d118c844b1b9a6035555edd9f2 on 2026-11-12 with Elazar's explicit approval. Documentation-only conflict resolved by preserving both the email-validation and native-submit rules. No remote refresh or push was performed. Manual main verification and explicit push approval remain pending.

Verification on the integrated executable tree:
- Focused tests: `node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadlessLocal --karma-config=karma.login-check.cjs --include=src/app/components/button/button.component.spec.ts --include=src/app/pages/login/login.page.spec.ts --ts-config=tsconfig.login-check.json` — exit 0, 9/9 passed with Chrome Headless 157. The sandboxed launch timed out; rerunning outside the restricted sandbox succeeded. An intervening attempt with --port=9877 was rejected as an unsupported CLI argument before tests ran.
- Production build: `node node_modules/@angular/cli/bin/ng.js build --configuration=production` — exit 0; build hash 3557e6b8b72f4ab6. Warnings for bundle/style budgets and CommonJS exceljs/lodash, outside this change.
- `git diff --check` passed. Full suite and live authentication were not run; focused checks and production build cover this frontend change.
- No schema, production, accounting, authentication policy, or external API contract changes.
- Existing untracked .codex-remote-attachments/ was preserved.
