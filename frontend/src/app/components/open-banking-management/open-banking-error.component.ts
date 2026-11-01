import { Component, Input } from '@angular/core';

export interface BankingSupportError { code: string; errorId: string; message: string; partial?: boolean; }

export function savedConsentLabel(hasConsent: boolean, isDirect?: boolean | null): string {
  return !hasConsent ? '✗ ללא הרשאה' : isDirect ? 'נמשך דרך חשבון הבנק' : '✓ פעיל';
}

export function bankingRequestError(error: any, code = 'OB-01'): BankingSupportError {
  if (error?.error?.supportError) return error.error.supportError;
  const issue = { code, errorId:globalThis.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`, partial:true,
    message:'לא הצלחנו להשלים את הפעולה. המידע הקיים נשמר. אפשר לנסות שוב.' };
  console.error('[OpenBanking]', {code:issue.code,errorId:issue.errorId,reason:'request_failed',httpStatus:error?.status});
  return issue;
}

@Component({
  selector: 'app-open-banking-error', standalone: true,
  template: `@if (issue) {
    <div role="alert" dir="rtl" class="banking-error">
      <p>{{ issue.message }}</p>
      <p>קוד: {{ issue.code }} · מזהה שגיאה: <bdi>{{ issue.errorId }}</bdi></p>
      <button type="button" (click)="copy()">העתקת פרטי השגיאה לתמיכה</button>
      @if (copyMessage) { <span role="status">{{ copyMessage }}</span> }
    </div>
  }`,
  styles: [`.banking-error { color: #a12222; padding: .75rem; margin-block: .75rem; border: 1px solid currentColor; border-radius: .4rem; overflow-wrap: anywhere; } button { margin-inline-end: .5rem; }`],
})
export class OpenBankingErrorComponent {
  @Input() issue: BankingSupportError | null | undefined;
  copyMessage = '';
  async copy(): Promise<void> {
    if (!this.issue) return;
    try {
      await navigator.clipboard.writeText(`${this.issue.message}\nקוד: ${this.issue.code}\nמזהה שגיאה: ${this.issue.errorId}`);
      this.copyMessage = 'פרטי השגיאה הועתקו';
    } catch { this.copyMessage = 'לא הצלחנו להעתיק. אפשר להעתיק את הקוד ומזהה השגיאה שמופיעים כאן.'; }
  }
}
