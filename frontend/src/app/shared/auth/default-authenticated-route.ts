/**
 * The single entry point into the authenticated app.
 *
 * Both cold start with a restored session and a successful interactive login
 * land here. The app deliberately does NOT remember or restore the last visited
 * route — see `StartupRedirectGuard`, `LoginPageGuard` and `LoginPage.enterApp`.
 */
export const DEFAULT_AUTHENTICATED_PATH = '/my-account';
