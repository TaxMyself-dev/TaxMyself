import { Component, Input, OnDestroy, signal } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { ButtonSize } from '../button/button.enum';
import type { BankingSupportError, BankingFullSyncRetry } from './open-banking-error.component';
@Component({selector:'app-banking-toast-content',standalone:true,imports:[ButtonComponent],
 template: `<div dir="rtl" class="banking-toast-content">
  <strong>{{message.summary}}</strong><p>{{message.detail}}</p>
  @if(issue;as error){<p>קוד: {{error.code}} · מזהה שגיאה: <bdi>{{error.errorId}}</bdi></p> }
   <app-p-button [buttonSize]="small" variant="text" [icon]="copied()?'pi pi-check':'pi pi-copy'"
    [buttonText]="copied()?'הועתק':(issue?'העתקת פרטי השגיאה':'העתקת ההודעה')" (onButtonClicked)="copy()" [disabled]="copying()" />
   @if(fullSyncRetry;as retry){
    @if(retry.enabled()){
     <app-p-button [buttonSize]="small" icon="pi pi-refresh" buttonText="משוך מחדש את כל התנועות"
      [isLoading]="retry.busy()" [disabled]="retry.busy()" (onButtonClicked)="retryFullSync()" />
     @if(retry.busy()){<span role="status" aria-live="polite">סנכרון מלא מתבצע…</span>}
    }
   }
   <span role="status" aria-live="polite">{{copyFailure()}}</span>
 </div>`,styles:[`.banking-toast-content{min-width:0;overflow-wrap:anywhere}p{margin:.4rem 0}strong{display:block}`]})
export class BankingToastContentComponent implements OnDestroy {
 @Input() message:any={}; readonly small=ButtonSize.AUTO;
 readonly copied=signal(false);readonly copying=signal(false);readonly copyFailure=signal('');
 private timer:ReturnType<typeof setTimeout>|undefined;private destroyed=false;
 get issue():BankingSupportError|undefined{return this.message.data?.supportError;}
 get fullSyncRetry():BankingFullSyncRetry|undefined{return this.message.data?.fullSyncRetry;}
 retryFullSync():void{const retry=this.fullSyncRetry;if(retry?.enabled() && !retry.busy())retry.run();}
 async copy():Promise<void>{const issue=this.issue;if(this.copying())return;
  this.copying.set(true);this.copyFailure.set('');
  try{await navigator.clipboard.writeText(issue ? issue.message+'\nקוד: '+issue.code+'\nמזהה שגיאה: '+issue.errorId : this.message.detail ?? this.message.summary ?? '');
   if(this.destroyed)return;this.copied.set(true);clearTimeout(this.timer);
   this.timer=setTimeout(()=>this.copied.set(false),1000);
  }catch{if(!this.destroyed)this.copyFailure.set('לא הצלחנו להעתיק. אפשר להעתיק את הפרטים ידנית.');}
  finally{if(!this.destroyed)this.copying.set(false);}
 }
 ngOnDestroy():void{this.destroyed=true;clearTimeout(this.timer);}
}
