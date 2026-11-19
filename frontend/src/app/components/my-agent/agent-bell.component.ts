import { Component, OnDestroy, OnInit, inject, signal, effect } from '@angular/core';
import { Router } from '@angular/router';
import { AgentNotice, MyAgentService } from './my-agent.service';
@Component({selector:'app-agent-bell',standalone:true,template:`@if(visible()){
 <button type="button" [attr.aria-label]="'התראות מהסוכן: '+api.unread()+' שלא נקראו'" [attr.aria-expanded]="expanded()" (click)="expanded.set(!expanded())"><i class="pi pi-bell" aria-hidden="true"></i>@if(api.unread()){<span class="badge">{{api.unread()>99?'99+':api.unread()}}</span>}</button>
 @if(expanded()){<div class="notices" dir="rtl" (keydown.escape)="expanded.set(false)" aria-label="התראות מהסוכן"><strong>הודעות מהסוכן</strong>@for(n of notices();track n.id){<button type="button" (click)="open(n)"><b>{{n.state==='waiting'?'הסוכן מחכה לתשובה שלך':n.state==='classified'?'התנועה סווגה':'נדרשת בדיקה'}}</b><small>{{n.display.merchant}}</small></button>}@if(!notices().length){<p>אין הודעות כרגע.</p>}<button type="button" (click)="open()">לסוכן שלי</button></div>}}
 `,styles:[`:host{position:relative;display:inline-flex}button{position:relative;border:0;background:white;color:#363636;min-width:44px;min-height:44px;cursor:pointer;font:inherit;font-size:20px}button:focus-visible{outline:2px solid #267d78;outline-offset:2px}.badge{position:absolute;top:0;inset-inline-end:0;background:#267d78;color:white;border-radius:12px;font:12px Arial;padding:2px 5px}.notices{position:absolute;top:48px;inset-inline-end:0;z-index:1000;width:min(320px,85vw);background:white;border:1px solid #ddd;border-radius:12px;padding:16px;box-shadow:0 4px 16px #0002}.notices button{display:block;text-align:right;width:100%;font-size:14px;border-bottom:1px solid #eee;padding:12px 0}.notices small{display:block;margin-top:5px}`]})
export class AgentBellComponent implements OnInit,OnDestroy {
 readonly api=inject(MyAgentService);private readonly router=inject(Router);readonly visible=signal(false);readonly expanded=signal(false);readonly notices=signal<AgentNotice[]>([]);
 private timer?:ReturnType<typeof setInterval>;private busy=false;private destroyed=false;
 constructor(){effect(()=>{this.api.context();this.visible.set(false);this.expanded.set(false);this.notices.set([]);});}
 ngOnInit(){void this.refresh();this.timer=setInterval(()=>void this.refresh(),30000);}
 ngOnDestroy(){this.destroyed=true;if(this.timer)clearInterval(this.timer);}
 async refresh(){if(this.busy)return;const owner=this.api.context();if(!owner){this.visible.set(false);this.api.unread.set(0);return;}this.busy=true;
  try{const data=await this.api.inbox();if(!this.destroyed && owner===this.api.context()){this.visible.set(true);this.notices.set(data.items.filter(n=>!n.read_at).slice(0,5));}}catch{this.visible.set(false);}finally{this.busy=false;}}
 open(n?:AgentNotice){this.expanded.set(false);void this.router.navigate(['/settings-new'],{queryParams:{section:'agent',...(n?{notice:n.id}:{})}});}
}
