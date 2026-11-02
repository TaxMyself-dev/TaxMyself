import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

const RETURN_KEY = 'tm.feezbackReturnTo';

@Injectable({ providedIn: 'root' })
export class OpenBankingNavigationService {
  private readonly router = inject(Router);

  begin(resume = false): void {
    if (resume && this.read()) return;
    const navigation = this.router.getCurrentNavigation?.() ?? this.router.lastSuccessfulNavigation;
    const previous = navigation?.previousNavigation?.finalUrl;
    const url = previous ? this.router.serializeUrl(previous) : '/my-account';
    try { sessionStorage.setItem(RETURN_KEY, this.safeUrl(url)); } catch { /* Storage may be unavailable. */ }
  }

  clear(): void {
    try { sessionStorage.removeItem(RETURN_KEY); } catch { /* Storage may be unavailable. */ }
  }

  returnToOrigin(): Promise<boolean> {
    const url = this.safeUrl(this.read());
    this.clear();
    return this.router.navigateByUrl(url, { replaceUrl: true });
  }

  private read(): string | null {
    try { return sessionStorage.getItem(RETURN_KEY); } catch { return null; }
  }

  private safeUrl(url: string | null): string {
    if (!url || !url.startsWith('/') || url.startsWith('//') || /[\\\r\n]/.test(url) ||
        /^\/billing\/open-banking(?:[/?#]|$)/.test(url)) return '/my-account';
    return url;
  }
}