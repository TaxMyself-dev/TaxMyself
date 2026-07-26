import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Persistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  debugErrorMap,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { isInstalledPwa } from '../runtime/runtime-mode';

/** Which persistence the running instance was initialized with. */
export type FirebaseAuthPersistenceMode = 'installed-pwa-local' | 'browser-session';

let resolvedMode: FirebaseAuthPersistenceMode | null = null;

/**
 * The store hierarchy for a runtime mode. Exported so the behavior can be
 * exercised directly against the Firebase SDK in tests, instead of a copy of
 * the list drifting away from what ships.
 */
export function authPersistenceFor(mode: FirebaseAuthPersistenceMode): Persistence[] {
  return mode === 'installed-pwa-local'
    ? [browserLocalPersistence, indexedDBLocalPersistence]
    : [browserSessionPersistence];
}

/**
 * Choose the Firebase Auth persistence for this runtime, BEFORE anything reads
 * auth state. Called once from `main.ts`, ahead of `bootstrapModule`.
 *
 * ## Why this has to happen at initialization and not via `setPersistence()`
 *
 * The installed PWA and the website share one origin, therefore one storage
 * partition (on Android/desktop; iOS home-screen apps get their own container).
 * `setPersistence()` on a live Auth instance does not just change the target —
 * `PersistenceUserManager.setPersistence()` reads the current user, **removes it
 * from the old store**, then writes it to the new one. So calling
 * `setPersistence(browserSessionPersistence)` from a browser tab would delete
 * the record the installed PWA relies on and silently sign the app out. The
 * same is true of AngularFire's `PERSISTENCE` injection token, which is
 * implemented with exactly that call.
 *
 * Passing the persistence to `initializeAuth()` avoids this entirely: the Auth
 * instance only ever touches the stores listed here, so browser mode never
 * reads, writes or clears the installed app's record.
 *
 * ## Chosen hierarchies
 *
 * - Installed PWA → `[browserLocalPersistence, indexedDBLocalPersistence]`.
 *   `browserLocalPersistence` is the persistence in use (localStorage survives
 *   closing and reopening the app). IndexedDB is listed only as a one-time
 *   migration source: sessions created before this change live there (it was
 *   the default), and Firebase migrates them into the primary store on first
 *   launch instead of forcing installed users to sign in again.
 * - Regular browser → `[browserSessionPersistence]` only. sessionStorage
 *   survives a refresh of the same tab and dies with the tab/browser session,
 *   and it is never shared with another tab — so a new tab cannot inherit the
 *   installed app's permanent login. `inMemoryPersistence` is deliberately not
 *   used: it would not survive a refresh.
 *
 * AngularFire's compat layer reuses an already-initialized Auth instance
 * (`AuthCompat` checks `provider.isInitialized()` first), so `AngularFireAuth`
 * transparently picks up whatever is configured here — but ONLY as long as
 * `firebase` resolves to a single copy. `@angular/fire` depends on
 * `firebase@^11.8`; when the app pinned `firebase@^10` a second, nested copy was
 * installed and AngularFire built its own app + Auth from it, silently ignoring
 * everything configured here. Keep the app's `firebase` dependency inside
 * @angular/fire's range so npm hoists one copy.
 */
export function initializeFirebaseAuthPersistence(): FirebaseAuthPersistenceMode {
  if (resolvedMode) {
    return resolvedMode;
  }

  const installedPwa = isInstalledPwa();
  resolvedMode = installedPwa ? 'installed-pwa-local' : 'browser-session';

  // AngularFireModule.initializeApp() creates the same default app lazily from
  // the same options object; initializeApp() is idempotent for identical
  // options, so whichever runs first wins and the other reuses it.
  const app = getApps().length > 0 ? getApp() : initializeApp(environment.firebase);

  try {
    initializeAuth(app, {
      persistence: authPersistenceFor(resolvedMode),
      popupRedirectResolver: browserPopupRedirectResolver,
      // Matches what firebase/compat/auth applies to instances it creates, so
      // error messages are unchanged now that we create the instance instead.
      errorMap: debugErrorMap,
    });
  } catch (err) {
    // Only reachable if something injected AngularFireAuth before bootstrap.
    // Auth still works — but with the SDK default persistence, which on a
    // browser tab means a shared, permanent login. Loud on purpose.
    console.error('[FirebaseAuth] persistence could not be applied — Auth was already initialized:', err);
  }

  return resolvedMode;
}

/** The persistence mode chosen at startup, or null before initialization. */
export function firebaseAuthPersistenceMode(): FirebaseAuthPersistenceMode | null {
  return resolvedMode;
}

/** True once {@link initializeFirebaseAuthPersistence} has run. */
export function isFirebaseAuthPersistenceReady(): boolean {
  return resolvedMode !== null;
}
