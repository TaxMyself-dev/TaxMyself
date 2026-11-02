import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import type { BankingSupportError } from './open-banking-error.component';
@Injectable({providedIn:'root'})
export class BankingNotificationService {
  private readonly messages=inject(MessageService);
  support(issue:BankingSupportError):void {
    this.messages.clear('banking');
  this.messages.add({key:'banking',severity:'error',summary:'הפעולה לא הושלמה',detail:issue.message,
      sticky:true,data:{supportError:issue}});
  }
  message(detail:string,success=false):void {
    this.messages.clear('banking');
  this.messages.add({key:'banking',severity:success?'success':'error',summary:success?'הושלם':'הפעולה לא הושלמה',detail,
      life:success?5000:undefined,sticky:!success});
  }
}
