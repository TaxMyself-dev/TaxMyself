import { Component, Input, OnChanges, inject } from '@angular/core';
import { BankingNotificationService } from './banking-notification.service';

export interface BankingSupportError { code: string; errorId: string; message: string; partial?: boolean; }

export function savedConsentLabel(hasConsent: boolean, isDirect?: boolean | null): string {
  return !hasConsent ? '✗ ללא הרשאה' : '✓ פעיל';
}

export function bankingRequestError(error: any, code = 'OB-01'): BankingSupportError {
  if (error?.error?.supportError) return error.error.supportError;
  const issue = { code, errorId:globalThis.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`, partial:true,
    message:'לא הצלחנו להשלים את הפעולה. המידע הקיים נשמר. אפשר לנסות שוב.' };
  console.error('[OpenBanking]', {code:issue.code,errorId:issue.errorId,reason:'request_failed',httpStatus:error?.status});
  return issue;
}

@Component({selector:'app-open-banking-error',standalone:true,template:''})
export class OpenBankingErrorComponent implements OnChanges {
 @Input() issue:BankingSupportError|null|undefined;
 private readonly notifications=inject(BankingNotificationService);private previousId:string|undefined;
 ngOnChanges():void{if(!this.issue){this.previousId=undefined;return;}
  if(this.issue.errorId!==this.previousId){this.previousId=this.issue.errorId;this.notifications.support(this.issue);}}
}
