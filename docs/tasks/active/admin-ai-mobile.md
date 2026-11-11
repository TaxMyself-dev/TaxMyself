# Admin tabs and AI chat mobile layout

- Status: `WORKER_COMPLETE`
- Branch: `new-ai-assistant`
- Base commit: `7f78af1586157539c2486027dd321872d9285e1f`
- Worktree: `C:/Users/user/Keepintax/TaxMyself-new-ai-assistant`

## Acceptance and scope

- Admin top-level and catalog tabs use Ionic horizontal scrolling.
- Chat actions wrap, long content stays within the viewport, messages scroll
  separately, and the composer has a bounded height and mobile font sizing.
- No backend, authentication, accounting, schema or external API changes.
- No main integration or remote push authorized.

## Verification

- `npm.cmd exec -- ng test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.admin-ai-chat.spec.json --include=src/app/pages/admin-panel/admin-panel.page.spec.ts --include=src/app/pages/dev-agent/dev-agent.route.spec.ts`: 13/13 passed.
- Initial test invocation without `--include` failed because the runner selected
  specs outside the focused tsconfig; corrected by explicitly selecting files.
- `npm.cmd run build -- --configuration production`: passed, with component and
  initial bundle budget and CommonJS warnings in files outside this change.
- `git diff --check`: passed.
- Physical phone, virtual keyboard and authenticated visual checks remain manual.
- Unrelated untracked journey timing and conversation plans preserved.
