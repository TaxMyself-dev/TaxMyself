import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  debugErrorMap,
  initializeAuth,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';

let initialized = false;

/**
 * Create the Firebase Auth instance with `browserSessionPersistence`, BEFORE
 * anything reads auth state. Called once from `main.ts`, ahead of
 * `bootstrapModule`.
 *
 * ## Why one persistence everywhere
 *
 * Every runtime — desktop browser, mobile browser, installed PWA — uses
 * sessionStorage. It survives a refresh of the same tab/app window and dies
 * with the browsing context, and it is never shared with another tab, so a new
 * tab does not inherit an existing login. `inMemoryPersistence` is deliberately
 * not used: it would not survive a refresh.
 *
 * ## Why this happens at initialization and not via `setPersistence()`
 *
 * `PersistenceUserManager.setPersistence()` reads the current user, **removes it
 * from the old store**, then writes it to the new one — so switching after the
 * fact churns the stored session on every load. AngularFire's `PERSISTENCE`
 * injection token is implemented with exactly that call. Passing the
 * persistence to `initializeAuth()` avoids it: the Auth instance only ever
 * touches the store listed here.
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
export function initializeFirebaseAuthPersistence(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  // AngularFireModule.initializeApp() creates the same default app lazily from
  // the same options object; initializeApp() is idempotent for identical
  // options, so whichever runs first wins and the other reuses it.
  const app = getApps().length > 0 ? getApp() : initializeApp(environment.firebase);

  try {
    initializeAuth(app, {
      persistence: browserSessionPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
      // Matches what firebase/compat/auth applies to instances it creates, so
      // error messages are unchanged now that we create the instance instead.
      errorMap: debugErrorMap,
    });
  } catch (err) {
    // Only reachable if something injected AngularFireAuth before bootstrap.
    // Auth still works — but with the SDK default persistence, which means a
    // permanent login shared across every tab. Loud on purpose.
    console.error('[FirebaseAuth] persistence could not be applied — Auth was already initialized:', err);
  }
}

/** True once {@link initializeFirebaseAuthPersistence} has run. */
export function isFirebaseAuthPersistenceReady(): boolean {
  return initialized;
}
