# Backend and agent image packaging

Build from the repository root:

```powershell
docker build --progress=plain -t keepintax-agent-image-packaging:local -f backend/Dockerfile backend
docker run --rm --network none --read-only --entrypoint node keepintax-agent-image-packaging:local scripts/check-agent-image.cjs
```

The context is `backend`, matching both release scripts' `git archive <commit>:backend` snapshots. The tracked archive includes `agent/package.json`, its lockfile, sources, build scripts, messages and project.inlang. Neither deployment script excludes the agent source; generated `agent/dist` and dependencies are intentionally rebuilt. No deployment is necessary for this check.

The Nest CommonJS package and agent ESM package retain independent manifests, lockfiles, installs, builds and node_modules. esbuild bundles agent source, generated messages and literal dynamic imports into `agent/dist/*.mjs`; `packages: external` leaves npm imports external. Those resolve against `agent/node_modules`, installed with `npm ci --omit=dev --ignore-scripts`. Agent root lifecycle scripts need development tools and are only run during the full build install. The production dependency closure has no package install scripts; no runtime source asset reads were found apart from the optional journey timing log (runtime output, not an input asset).

`AgentHarnessService.load()` uses `agent-bundle-loader.ts`. From compiled `dist/agent-harness`, `../../agent/dist/agent-http.mjs` resolves to `/usr/src/app/agent/dist/agent-http.mjs`. The existing AGENT_BUNDLE_PATH override, lazy load, retry, rejection guard and request context are preserved. The final stage's `RUN --network=none` imports through that exact shared loader and asserts `handleAgentHttpRequest` and `disposeAppRuntime` are functions. It disposes the unacquired runtime without handling a request or acquiring DB/AI layers. The probe rejects AGENT_BUNDLE_PATH overrides. It also checks main.js and existing backend assets. The container check uses no host mounts or env files.

Node 22.22.3 Alpine, Chromium, root runtime user, command and backend asset copies are preserved. Only production dependency closures enter the final image; the existing backend manifest still classifies some tooling (including Nest CLI) as production dependencies. This task does not reclassify backend dependencies.

The Docker ignore rules exclude nested env files (including examples), credentials, private keys, local npm configuration, dependency/build directories, evals, coverage, local state and transaction data before COPY in any stage. Local backend/.env is ignored by Git and Docker. Never pass secrets as build args. Cloud source snapshots contain only tracked source and apply Docker ignore rules again during image build.

Focused dependency-free diagnostics (Node 24 for source TS stripping):

```powershell
node --test backend/scripts/check-agent-image.test.cjs backend/scripts/agent-bundle-loader.test.cjs
```

These diagnose the check's contract and source loader; they do not prove Linux image compatibility. The source test supplies the CommonJS __dirname global and resolves TS extensions without changing production compilation.

## Verification on 2026-11-22

Base: local main `5d405a014aded6995c4c4bf987af894f275eada8`. Fetch succeeded; origin/main was `82446400227ee6e5ed8751eafc2eab1656c4161c`. Main's pre-existing untracked backend/journey-timings.local was preserved. No main integration, push, production access or deployment occurred.

- `node --test backend/scripts/check-agent-image.test.cjs backend/scripts/agent-bundle-loader.test.cjs`: 7 passing tests after corrections; the source diagnostic emits Node's module-type warning, which does not apply to compiled CommonJS.
- `node --check backend/scripts/check-agent-image.cjs`: passed.
- `npm ci --no-audit --no-fund` in backend: failed, ENOSPC on C:. The task-created partial node_modules was removed; no dependencies were borrowed from another worktree.
- Docker Desktop started successfully; server reported Linux/amd64. `docker build --progress=plain -t keepintax-agent-image-packaging:local -f backend/Dockerfile backend` failed while preparing the Node base filesystem, before npm/build/probe steps: `/var/lib/desktop-containerd/.../data: read-only file system`. This attempt preceded the final loader extraction; it is environment failure evidence, not final-revision validation.
- Nest build, focused Jest, agent install/build, final image build, runtime import, layer/content audit and dependency audit remain blocked by disk/storage exhaustion. No final image exists and no image-loading success is claimed.

After restoring disk space and Docker storage health, run the two Docker commands above, backend `npm ci`, `npm run build`, and `npm test -- --runInBand agent-harness` in this worktree. Inspect the final image and build-stage contents for excluded local files. Do not start the full backend against a shared database to test packaging. Full application/manual main tests are separate from this offline packaging check.
