# Merge local main into test and deploy frontend

- Status: `TEST_INTEGRATED`
- Source main: `96adf4643e91ebdb4090259308d06c46d493e2eb`
- Test base: `2cfd62ebf69a34050846987f768b5afd4bf5d225`
- User explicitly approved full local-main integration, test push, and deployment
  limited to frontend if no backend changes are required. Main push not approved.

## Integration

- Merge all local main history into test; retain existing browser-update banner.
- Includes Enter submit 24b3b56b and mobile row-listener fix f8b4e5d7.
- Code merged cleanly. Two add/add task-document conflicts resolved with main's
  more recent delivery records, preserving both test checks and later main checks.
- No backend, schema, accounting, credential or API changes relative to test base.
- `git diff --quiet afb8888b -- frontend`: PASS, exact frontend source/config/lock
  equivalence to the previously verified production-build revision.
- Reuse successful Node 20.19.0 production build 8f649e7ac44f7a80 from that exact
  frontend tree. This is reused evidence, not a newly executed production build.

## Combined verification

From frontend with Chrome Headless 157 / Node 20.19.0:

npm exec --yes --package=node@20.19.0 -- node node_modules/@angular/cli/bin/ng.js test
--watch=false --progress=false --browsers=ChromeHeadless
--karma-config=karma.pwa-update.conf.js
--ts-config=.angular/tsconfig.main-to-test.spec.json
--include=src/app/components/button/button.component.spec.ts
--include=src/app/pages/login/login.page.spec.ts
--include=src/app/components/generic-table/generic-table.component.spec.ts
--include=src/app/components/generic-table/table-actions.spec.ts
--include=src/app/components/table-row-actions-menu/table-row-actions-menu.component.spec.ts
--include=src/app/components/pwa-banners/pwa-banners.component.spec.ts

Result: 52 tests PASS, exit 0. The ignored temporary tsconfig includes exactly
these six specs and d.ts files. The known unrelated table-action consumer fixture
failure documented in the mobile task is outside this focused selection.
`git diff --cached --check`: PASS. No executable changes after verification.

## Authorized deployment

After committing and pushing test, run the existing deploy-test.ps1 Frontend
entrypoint under the isolated Node 20.19.0 PATH. It rechecks clean test equality,
checks/re-authenticates Firebase if needed, runs npm ci, builds build:dev, and
publishes only hosting:app in taxmyself-5d8a0. No Cloud Run write is performed.
Verify the public test domain ngsw manifest matches the final local DEV artifact.
Deployment completion evidence is reported in chat; no actual deployment is
claimed by this pre-deployment record.
