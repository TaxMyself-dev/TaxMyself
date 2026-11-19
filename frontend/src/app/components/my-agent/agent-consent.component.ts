import { Component, OnDestroy, OnInit, inject, signal, effect } from '@angular/core';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { MyAgentComponent } from './my-agent.component';
import { MyAgentService } from './my-agent.service';
@Component({selector:'app-agent-consent',standalone:true,imports:[DialogModule,MyAgentComponent],template:`
 <p-dialog header="היי, איזה כיף שהתחברת לבנקאות הפתוחה!" [visible]="visible()" (visibleChange)="close()" [modal]="true" [style]="{width:'720px',maxWidth:'95vw'}" [draggable]="false" [resizable]="false">
  <div dir="rtl"><p>האם תרצה שהמערכת תעשה לך סיווג אוטומטי באמצעות AI?</p><p>אפשר לסווג רק תנועות שאמצעי התשלום שלהן משויך לחשבון. כאן אפשר להשלים את השיוך ולהפעיל את הסיווג.</p>
  @if(visible()){<app-my-agent />}<button type="button" (click)="close()">סיום / לא עכשיו</button></div>
 </p-dialog>`})
export class AgentConsentComponent implements OnInit,OnDestroy {
 readonly visible=signal(false);private readonly api=inject(MyAgentService);private readonly router=inject(Router);
 private timer?:ReturnType<typeof setInterval>;private destroyed=false;
 constructor(){effect(()=>{this.api.context();this.visible.set(false);});}
 ngOnInit(){void this.check();this.timer=setInterval(()=>void this.check(),5000);}
 ngOnDestroy(){this.destroyed=true;if(this.timer)clearInterval(this.timer);}
 private async check(){if(this.visible() || this.destroyed || !this.api.context())return;
  try{const owner=this.api.context();const s=await this.api.status();if(this.destroyed || owner!==this.api.context())return;if(s.available && s.connected && !s.noticeSeen && !s.enabled){this.visible.set(true);if(this.timer)clearInterval(this.timer);}}catch{}}
 async close(){this.visible.set(false);try{await this.api.dismiss();}catch{} }
}
