## Purpose

Provides browser/PWA connectivity classification and safe recovery of shared
read-only application state after a genuine network reconnection.

## Key entities/files

- `network-status.service.ts` — classifies browser/backend reachability and
  exposes the reconnect timestamp.
- `app-refresh.service.ts` — coalesces refresh runs and reloads only the
  allow-listed `billing/me` and `business/get-businesses` GET state.
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

## Related topics

- `frontend/src/app/services/billing-state.service.ts`
- `frontend/src/app/services/generic.service.ts`
- `frontend/src/app/interceptors/authError.interceptor.ts`
