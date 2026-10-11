# Home mobile camera upload

- Status: `COMPLETE_LOCAL`
- Task manager: current chat
- Worktree: C:/Users/user/Keepintax/TaxMyself
- Branch: new-ai-chat
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
accounting or external API contract changes. Work remains on the user's current
feature branch; other active branches/worktrees are outside this task.

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
- Delivery: local commit on `new-ai-chat`; no main integration, push or deployment.
- Manual check: Android/iPhone camera launch, cancellation, confirmed capture and Drive result.
- Documentation: home and quick-upload topic AGENTS.md.
