# Gmail pull and processing status

The shared Gmail settings component shows active work per mailbox. Pull completion
and document processing are separate stages; a successful pull does not announce
that all processing has finished. Polling continues while either stage is active.
Normal approval/password states are not active background processing.

Each mailbox has one initially closed, native details disclosure for its latest
pull. The ordinary disclosure contains exactly four values: pull status,
processing status, total messages, and total attachment candidates (including
imported, duplicate, filtered and unresolved candidates). Full run diagnostics
remain inside that disclosure only when `environment.enableDevTools` is enabled;
the production environment disables this flag. Run history is retained in storage
but is not listed on the settings screen. Status reads return the latest run per
mailbox plus all work still running, so older active processing remains visible.

Successful durable manual pulls clear older account errors without advancing the
nightly cursor. The update cannot replace an in-flight sync or one started later.
Status reads also suppress an existing account error when the latest pull for the
same mailbox completed successfully and started after that error's sync started.
An older successful pull, another mailbox's pull, or a newer partial pull cannot
clear an error. Processing attention on the latest run remains visible separately.
Status reads do not mutate persisted error history.

## Verification

From `frontend`:

```powershell
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --ts-config=tsconfig.gmail-status.spec.json --include=src/app/pages/settings/gmail-integration/gmail-integration.component.spec.ts --include=src/app/services/gmail-sync-state.spec.ts
node node_modules/@angular/cli/bin/ng.js build --configuration production --progress=false
```

From `backend`:

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/email-intake/email-intake-runs.spec.ts src/integrations/services/gmail-sync.service.spec.ts src/integrations/services/user-integrations.service.spec.ts
node node_modules/@nestjs/cli/bin/nest.js build
```

These checks do not start Nest or invoke mail, Drive, or AI providers.
No schema, production data, accounting, OAuth, or provider-contract changes.
