# Backend and agent image packaging

Build from the repository root:

```powershell
docker build --progress=plain -t keepintax-agent-image-packaging:local -f backend/Dockerfile backend
docker run --rm --network none --read-only --entrypoint node keepintax-agent-image-packaging:local scripts/check-agent-image.cjs
```

The context is `backend`, matching both release scripts' `git archive <commit>:backend` snapshots. The tracked archive includes `agent/package.json`, its lockfile, sources, build scripts, messages and project.inlang. Neither deployment script excludes the agent source; generated `agent/dist` and dependencies are intentionally rebuilt. No deployment is necessary for this check.

The Nest CommonJS package and agent ESM package retain independent manifests, lockfiles, installs, builds and node_modules. esbuild bundles agent source, generated messages and literal dynamic imports into `agent/dist/*.mjs`; `packages: external` leaves npm imports external. Those resolve against `agent/node_modules`, installed with `npm ci --omit=dev --ignore-scripts`. Agent postinstall and dependency lifecycle scripts run during the full build install. Only the root prepare script (Effect TypeScript/Oxlint development patch, unsupported on Alpine/musl) is removed from the temporary build-stage manifest before npm ci. COPY of the agent source restores its original manifest before build; tracked manifests and lockfiles are unchanged. esbuild does not need the development patch. The production dependency closure has no package install scripts; no runtime source asset reads were found apart from the optional journey timing log (runtime output, not an input asset).

`AgentHarnessService.load()` uses `agent-bundle-loader.ts`. From compiled `dist/agent-harness`, `../../agent/dist/agent-http.mjs` resolves to `/usr/src/app/agent/dist/agent-http.mjs`. The existing AGENT_BUNDLE_PATH override, lazy load, retry, rejection guard and request context are preserved. The final stage's `RUN --network=none` imports through that exact shared loader and asserts `handleAgentHttpRequest` and `disposeAppRuntime` are functions. It disposes the unacquired runtime without handling a request or acquiring DB/AI layers. The probe rejects AGENT_BUNDLE_PATH overrides. It also checks main.js and existing backend assets. The container check uses no host mounts or env files.

Node 22.22.3 Alpine, Chromium, root runtime user, command and backend asset copies are preserved. All build-time npm installs are pinned to npm 11.6.2 (the existing local/dev-agent toolchain): npm 10.9.8 in the Node base rejects both existing lockfiles, while npm 11.6.2 accepts them without lockfile changes. The final image retains its original npm installation. Only production dependency closures enter the final image; the existing backend manifest still classifies some tooling (including Nest CLI) as production dependencies. This task does not reclassify backend dependencies.

The Docker ignore rules exclude nested env files (including examples), credentials, private keys, local npm configuration, dependency/build directories, evals, coverage, local state and transaction data before COPY in any stage. Local backend/.env is ignored by Git and Docker. Never pass secrets as build args. Cloud source snapshots contain only tracked source and apply Docker ignore rules again during image build.

Focused dependency-free diagnostics (Node 24 for source TS stripping):

```powershell
node --test backend/scripts/check-agent-image.test.cjs backend/scripts/agent-bundle-loader.test.cjs
```

These diagnose the check's contract and source loader; they do not prove Linux image compatibility. The source test supplies the CommonJS __dirname global and resolves TS extensions without changing production compilation.

## Verification on 2026-11-22

Base: local main `5d405a014aded6995c4c4bf987af894f275eada8`. Fetch succeeded; origin/main was `82446400227ee6e5ed8751eafc2eab1656c4161c`. Main's pre-existing untracked backend/journey-timings.local was preserved. No main integration, push, production access or deployment occurred.

Recovery was explicitly authorized for npm-cache and AppData/Local/Temp only. The former cleared without errors; Temp reported 41 skipped/error records for unavailable files. No Docker data or other user files were deleted. About 23.8 GB was free after cleanup, before new installs/builds.

The built-in Docker builder failed even on a two-line Node-base build with `exec /bin/sh: exec format error`, while `docker run --rm --network none --platform linux/amd64 node:22.22.3-alpine /bin/sh -c 'uname -m; node --version'` succeeded (`x86_64`, `v22.22.3`). A separate builder resolved the executor issue without resetting existing Docker data:

```powershell
docker buildx create --name keepintax-agent-packaging --driver docker-container --driver-opt image=moby/buildkit:buildx-stable-1
docker buildx inspect keepintax-agent-packaging --bootstrap
docker buildx build --builder keepintax-agent-packaging --load --progress=plain --platform linux/amd64 -t keepintax-agent-image-packaging:local -f backend/Dockerfile backend
```

Focused target builds (`--target agent-runtime-deps`, `--target agent-build`, `--target development`) isolated the npm 10 lockfile failures and Alpine prepare failure before the final build. The successful build uses npm 11.6.2 for installs and skips only the temporary agent root prepare patch. Node, tracked manifests/lockfiles and the runtime user remain unchanged.

Results:

- `npm ci --no-audit --no-fund` in backend: passed (1176 host-platform packages).
- `npm run build` in backend: passed; compiled CommonJS loader and existing city/annual parameters/fonts verified.
- `npm test -- --runInBand agent-harness` in backend: 7 suites, 108 tests passed (185.198 seconds). The controller's expected unavailable-bundle test logs AGENT_UNAVAILABLE.
- `node --test backend/scripts/check-agent-image.test.cjs backend/scripts/agent-bundle-loader.test.cjs`: 7 passed. The source-only diagnostic emits a module-type warning; production uses compiled CommonJS.
- Linux agent build: passed (731 build packages); HTTP and worker bundles generated. Separate runtime install: 80 packages.
- Linux Nest build: passed (50.8 seconds); backend runtime install: 842 packages, versus 1179 in the Linux development install.
- Final image build probe: `AGENT_IMAGE_LOAD_OK: AgentHarnessService shared loader; handleAgentHttpRequest, disposeAppRuntime`, exit 0 with `RUN --network=none`.
- Actual Docker context export through a scratch `COPY . /context/` build and Node path audit: 1178 files, all required agent sources present, zero env/key/credential/dependency/build/eval/local-data paths matching the audit. This checks source before COPY into any project stage.
- `node --check backend/scripts/check-agent-image.cjs`, `git diff --check`: passed.

Initial failed attempts before cleanup were ENOSPC (npm) and containerd read-only storage (Docker); those were environment failures, not passing image evidence. npm 10 failures named missing google-auth-library in the backend and @emnapi/react peers in the agent. The Alpine prepare failure was ReplacementUnavailableError for the Oxlint musl integration. None were bypassed with lockfile edits or weakened checks.

Dependency installs emitted peer/deprecation/audit warnings from unchanged dependency manifests. Agent runtime audit reported 0 vulnerabilities; full agent build dependencies reported 25; backend runtime reported 90. No dependency upgrade or audit fix was attempted in this packaging task. Docker's existing casing/ENV-style warnings remain.

Full Nest startup, shared-DB tests, agent evals, provider calls, full agent source lint/typecheck/unit suite and frontend tests were not run: this change concerns packaging and the shared loader, verified by focused tests and actual Linux builds. Full application tests and manual main verification remain separate from this offline packaging check.

Final exported image: `keepintax-agent-image-packaging:local`, ID `sha256:64fce90acdefa2aa0fd5b925d6bf86cbd1e5f306f399868dbaf491769e22a9e5`, Linux/amd64, user root, command `["node","dist/main.js"]`. Full build command above exited 0. The compiled source, Dockerfile and ignore rules match the committed implementation; later documentation edits are outside the backend context.

The independent final-image check passed (exit 0), including a different cwd:

```powershell
docker run --rm --network none --read-only --workdir / --entrypoint node keepintax-agent-image-packaging:local /usr/src/app/scripts/check-agent-image.cjs
```

Output: `AGENT_IMAGE_LOAD_OK: AgentHarnessService shared loader; handleAgentHttpRequest, disposeAppRuntime`. No host mounts, env files, DB, workers or paid providers were used.

A separate diagnostic script was piped into `docker run --rm -i --network none --read-only --entrypoint node keepintax-agent-image-packaging:local`. It passed with `IMAGE_CONTENT_AUDIT_OK`. It checked both node_modules/.package-lock.json trees for zero `dev: true` entries, original agent type=module and prepare script, nonempty HTTP bundle/main/city/annual/font files, and absence of root/agent local env, sources and test artifacts. The script and detailed build logs remain in ignored `backend/.test-tmp/`; the permanent image probe is tracked under backend/scripts. No image/layer data was pruned. The isolated builder is retained for reuse.

Changed files across the packaging task:

- backend/Dockerfile
- backend/.dockerignore
- backend/src/agent-harness/agent-bundle-loader.ts
- backend/src/agent-harness/agent-harness.service.ts
- backend/scripts/check-agent-image.cjs
- backend/scripts/check-agent-image.test.cjs
- backend/scripts/agent-bundle-loader.test.cjs
- backend/src/agent-harness/AGENTS.md
- backend/agent/GUIDE.md
- docs/operations/agent-image-packaging.md
- docs/tasks/active/agent-image-packaging.md
