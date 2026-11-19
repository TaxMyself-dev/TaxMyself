## Purpose

Provides browser/PWA connectivity classification and safe recovery of shared
read-only application state after a genuine network reconnection. Also exposes
downloaded app updates for user-confirmed activation in browser tabs and PWAs.

## Key entities/files

- `network-status.service.ts` — classifies browser/backend reachability and
  exposes the reconnect timestamp.
- `app-refresh.service.ts` — coalesces refresh runs and reloads only the
  allow-listed `billing/me` and `business/get-businesses` GET state.
- `pwa-update.service.ts` — listens for ready service-worker versions and exposes
  the update prompt in every runtime, with user-triggered activation/reload.
- `components/pwa-banners/` — shared Hebrew update/connectivity/install banners;
  browser and installed-app update notifications use the same button/handler.
- `app.component.ts` — observes the reconnect timestamp and starts the shared
  refresh from the application shell.

## Main flows

- A transition back to `ONLINE` changes `reconnectedAt`; the application shell
  performs one shared-state refresh.
- The refresh call must remain inside Angular `untracked()`. Its synchronous
  billing/loading signal reads are implementation details, not dependencies of
  the reconnect effect. Tracking them creates a response-driven request loop.
- Concurrent reconnect/manual refresh attempts join the same in-flight promise.
  Failed mutations are never replayed.

- A VERSION_READY event makes the existing update banner visible in regular
  browser tabs and installed apps. VERSION_DETECTED alone does not prompt.
- Never reload automatically when an update arrives; only clicking Update calls
  the existing activation/reload path. Disable the button during activation.
- Service-worker-disabled sessions do not offer updates. Existing visibility
  checks and 15-minute throttling remain; no new polling is introduced.
- Focused regression command (Karma port 9893): `npm test -- --watch=false
  --progress=false --browsers=ChromeHeadless --karma-config=karma.pwa-update.conf.js
  --include=src/app/components/pwa-banners/pwa-banners.component.spec.ts
  --ts-config=tsconfig.pwa-update.spec.json` from frontend.

## Related topics

- `frontend/src/app/services/billing-state.service.ts`
- `frontend/src/app/services/generic.service.ts`
- `frontend/src/app/interceptors/authError.interceptor.ts`
