# Home mobile camera upload

- Status: `COMPLETE_LOCAL`
- Task manager: current chat
- Worktree: C:/Users/user/Keepintax/TaxMyself
- Branch: codex/mobile-camera-drive-upload
- Base commit: 8c30a975

## Business outcome

The home Add Expense menu offers direct camera capture on mobile and uploads
the confirmed photo through the existing Drive inbox flow.

## Acceptance criteria

- Mobile menu includes camera capture; desktop menu retains its existing actions.
- Camera opens synchronously from the menu click with rear-camera capture requested.
- Cancelled capture sends no upload; each new capture resets the picker.
- A single business uploads automatically. Multiple businesses require explicit selection.
- Existing file validation, upload feedback, permission gate and retry remain in effect.

## Scope and constraints

Frontend home and quick-upload dialog only. No schema, production, security,
accounting or external API contract changes. Work is isolated on
`codex/mobile-camera-drive-upload`; other active branches/worktrees are outside this task.

## Handoff

- Validation: `npm run build -- --configuration production` passed, exit 0.
  Existing unchanged stylesheet/bundle budgets and CommonJS dependencies emit warnings.
- Focused tests: `npm test -- --watch=false --browsers=ChromeHeadless
  --ts-config=tsconfig.camera-spec.json
  --include=src/app/components/quick-upload-drive-dialog/quick-upload-drive-dialog.component.spec.ts
  --include=src/app/pages/my-account/my-account.camera.spec.ts` passed: 12/12, exit 0.
  Chrome required execution outside the filesystem sandbox. The isolated spec
  config includes Node types because dashboard dependencies contain a Node console
  import; unrelated legacy specs were not run.
- Review: full diff and `git diff --check` passed; no generated files or secrets.
- Delivery: local commits on `codex/mobile-camera-drive-upload`; no main integration,
  push or deployment. `new-ai-chat` restored to the original base `8c30a975`
  with no camera-upload changes or task documentation.
- Manual check: Android/iPhone camera launch, cancellation, confirmed capture and Drive result.
- Documentation: home and quick-upload topic AGENTS.md.
- Follow-up: `npm run mobile` alone selects `environment.mobile.ts` and uses the
  frontend hostname for the local backend on port 3000. Ordinary startup retains
  `localhost:3000`. Transpiled environment assertions passed for localhost and
  LAN hostname in both configurations; `npm run build -- --configuration mobile`
  passed (exit 0), with existing CommonJS warnings for lodash and exceljs.
- Follow-up upload dialog: Cancel stays active and aborts the HTTP subscription;
  dismissal/destruction also aborts. Files already persisted in Drive are not
  deleted. Both shared buttons stay in one row, with a black loading Upload and
  white outlined Cancel. Added cancellation and destruction regression tests,
  including HttpTestingController verification of the cancelled request.
- Follow-up verification: same focused command passed 16/16 tests, exit 0;
  includes rendered button layout at 280px, enabled Cancel, black Upload/spinner,
  cancellation through a real HttpClient testing request, and destruction.
  Angular production build passed, exit 0, with unchanged budget/CommonJS warnings.
  Browser plugin connection timed out; rendered UI assertions ran in ChromeHeadless.
