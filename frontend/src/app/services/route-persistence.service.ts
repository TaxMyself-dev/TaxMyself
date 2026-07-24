import { DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router, UrlTree } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './auth.service';

/** localStorage key for the last restorable protected route. Cleared on logout. */
export const LAST_PROTECTED_ROUTE_KEY = 'tm.lastProtectedRoute';

const DEFAULT_AUTHENTICATED_PATH = '/my-account';

/**
 * Path prefixes that must never be restored after a cold start. Includes public
 * auth/registration surfaces, OAuth callbacks, and (via the `/` check below)
 * the root startup redirect itself.
 */
const EXCLUDED_PREFIXES = [
  '/login',
  '/register',
  '/shaam/callback',
] as const;

interface StoredRoute {
  url: string;
}

/**
 * Persists the last successful protected navigation so an authenticated PWA
 * cold start can restore path + query params instead of always opening
 * `/my-account`. Closing the app is not logout — only explicit logout clears
 * the saved value (see {@link LAST_PROTECTED_ROUTE_KEY} in AuthService).
 */
@Injectable({ providedIn: 'root' })
export class RoutePersistenceService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.onNavigationEnd(e));
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** Default landing path when nothing valid is saved. */
  get defaultAuthenticatedPath(): string {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  /** Remove any saved restore target (also done by AuthService on logout). */
  clear(): void {
    try {
      localStorage.removeItem(LAST_PROTECTED_ROUTE_KEY);
    } catch {
      // ignore quota / private-mode failures
    }
  }

  /**
   * Validated restore target for an authenticated online cold start, or the
   * default authenticated path when nothing usable is stored.
   */
  getRestoreUrlTree(): UrlTree {
    const saved = this.readValidatedUrl();
    if (!saved) {
      return this.router.parseUrl(DEFAULT_AUTHENTICATED_PATH);
    }
    return this.router.parseUrl(saved);
  }

  /** Path (+ query) to navigate after a successful interactive login. */
  getPostLoginUrl(): string {
    return this.readValidatedUrl() ?? DEFAULT_AUTHENTICATED_PATH;
  }

  private onNavigationEnd(e: NavigationEnd): void {
    // Only persist while a real session exists — never store bounce URLs from
    // failed/anonymous navigations that briefly hit NavigationEnd.
    if (!this.auth.isLoggedIn) {
      return;
    }
    if (!this.auth.getUserDataFromLocalStorage()) {
      return;
    }

    const url = e.urlAfterRedirects || e.url;
    if (!this.isRestorableUrl(url)) {
      return;
    }

    this.write(url);
  }

  private write(url: string): void {
    const payload: StoredRoute = { url };
    try {
      localStorage.setItem(LAST_PROTECTED_ROUTE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota / private-mode failures
    }
  }

  private readValidatedUrl(): string | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(LAST_PROTECTED_ROUTE_KEY);
    } catch {
      return null;
    }
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        this.clear();
        return null;
      }
      const url = (parsed as StoredRoute).url;
      if (typeof url !== 'string' || !this.isRestorableUrl(url)) {
        this.clear();
        return null;
      }
      return url;
    } catch {
      this.clear();
      return null;
    }
  }

  /**
   * Accept only same-app relative URLs that are not public/transient.
   * Rejects protocol-relative, absolute, and junk values from corrupted storage.
   */
  private isRestorableUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }
    const trimmed = url.trim();
    if (trimmed.length === 0 || trimmed.length > 2048) {
      return false;
    }
    // Must be a root-relative app path — never protocol-relative or absolute.
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
      return false;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      return false;
    }

    const path = trimmed.split('?')[0].split('#')[0];
    if (path === '/' || path === '') {
      return false;
    }

    return !EXCLUDED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(prefix + '/'),
    );
  }
}
