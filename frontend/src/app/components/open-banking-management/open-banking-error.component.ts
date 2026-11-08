import { Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { BankingNotificationService } from './banking-notification.service';

export interface BankingSupportError { code: string; errorId: string; message: string; partial?: boolean; }

export interface BankingFullSyncRetry {
  run: () => void;
  enabled: () => boolean;
  busy: () => boolean;
}

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
export class OpenBankingErrorComponent implements OnChanges, OnDestroy {
 @Input() issue:BankingSupportError|null|undefined;
 @Input() fullSyncRetry:BankingFullSyncRetry|undefined;
 private destroyed=false;
 private readonly notifications=inject(BankingNotificationService);private previousId:string|undefined;
 ngOnChanges():void {
  if(!this.issue){this.notifications.clearSupport(this.previousId);this.previousId=undefined;return;}
  if(this.issue.errorId===this.previousId)return;
  this.previousId=this.issue.errorId;
  const errorId=this.issue.errorId;
  const retry=this.fullSyncRetry && ['OB-03','OB-04'].includes(this.issue.code) ? {
    enabled:()=>!this.destroyed && this.issue?.errorId===errorId && !!this.fullSyncRetry?.enabled(),
    busy:()=>!!this.fullSyncRetry?.busy(),
    run:()=>{if(!this.destroyed && this.issue?.errorId===errorId && this.fullSyncRetry?.enabled() && !this.fullSyncRetry.busy())this.fullSyncRetry.run();},
  } : undefined;
  this.notifications.support(this.issue,retry);
 }
 ngOnDestroy():void{this.destroyed=true;this.notifications.clearSupport(this.previousId);}
}
