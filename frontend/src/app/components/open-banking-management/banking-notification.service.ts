import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import type { BankingSupportError, BankingFullSyncRetry } from './open-banking-error.component';
@Injectable({providedIn:'root'})
export class BankingNotificationService {
  private readonly messages=inject(MessageService);
  private supportErrorId:string|undefined;
  clearSupport(errorId:string|undefined):void {
    if(errorId && this.supportErrorId===errorId){this.messages.clear('banking');this.supportErrorId=undefined;}
  }
  support(issue:BankingSupportError,fullSyncRetry?:BankingFullSyncRetry):void {
    this.supportErrorId=issue.errorId;
    this.messages.clear('banking');
  this.messages.add({key:'banking',severity:'error',summary:'הפעולה לא הושלמה',detail:issue.message,
      sticky:true,data:{supportError:issue,...(fullSyncRetry?{fullSyncRetry}:{})}});
  }
  message(detail:string,success=false):void {
    this.supportErrorId=undefined;
    this.messages.clear('banking');
  this.messages.add({key:'banking',severity:success?'success':'error',summary:success?'הושלם':'הפעולה לא הושלמה',detail,
      life:success?5000:undefined,sticky:!success});
  }
}
