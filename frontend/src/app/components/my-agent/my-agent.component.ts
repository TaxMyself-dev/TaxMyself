import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal, effect, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountAssociationDialogComponent } from '../account-association-dialog/account-association-dialog.component';
import { AddBillComponent } from '../add-bill/add-bill.component';
import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { TransactionsService } from '../../pages/transactions/transactions.page.service';
import { IRowDataTable } from '../../shared/interface';
import { AgentNotice, AgentStatus, MyAgentService } from './my-agent.service';
@Component({selector:'app-my-agent',standalone:true,imports:[CommonModule,FormsModule,RouterLink,AccountAssociationDialogComponent,AddBillComponent,ButtonComponent],providers:[TransactionsService],templateUrl:'./my-agent.component.html',styleUrls:['./my-agent.component.scss']})
export class MyAgentComponent implements OnInit,OnDestroy {
 readonly api=inject(MyAgentService);private readonly route=inject(ActivatedRoute);
 readonly status=signal<AgentStatus|null>(null);readonly notices=signal<AgentNotice[]>([]);readonly busy=signal(false);readonly loading=signal(true);
 readonly error=signal('');readonly more=signal(false);readonly selected=signal(this.route.snapshot.queryParamMap.get('notice'));
 private readonly destroyRef=inject(DestroyRef);
 private cursor:string|null=null;private historyLoaded=false;
 readonly answers:Record<string,string>={};
 readonly transactions=inject(TransactionsService);
 readonly associationRow=signal<IRowDataTable|null>(null);readonly addingAccount=signal(false);
 readonly buttonColor=ButtonColor;readonly buttonSize=ButtonSize;
 private timer?:ReturnType<typeof setInterval>;private destroyed=false;private reading=false;
 constructor(){effect(()=>{this.api.context();this.status.set(null);this.notices.set([]);Object.keys(this.answers).forEach(k=>delete this.answers[k]);this.associationRow.set(null);this.addingAccount.set(false);this.transactions.accountsList.set([]);});}
 async ngOnInit() {this.route.queryParamMap?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p=>{this.selected.set(p.get('notice'));void this.refresh();});await this.refresh();this.timer=setInterval(()=>void this.refresh(),15000);}
 ngOnDestroy() {this.destroyed=true;if(this.timer)clearInterval(this.timer);}
 async refresh() {
  if(this.reading || this.busy())return;this.reading=true;
  const owner=this.api.context();if(!owner){this.status.set(null);this.notices.set([]);this.loading.set(false);this.reading=false;this.error.set("הסוכן שלי זמין לבעל החשבון בלבד.");return;}
  try {const status=await this.api.status();const inbox=status.available?await this.api.inbox():{items:[],hasMore:false,nextCursor:null};
   if(this.selected() && status.available && !inbox.items.some(n=>n.id===this.selected())){const focus=await this.api.notice(this.selected());inbox.items.unshift(focus);}
   if(this.destroyed || owner!==this.api.context())return;
   if(!this.historyLoaded)this.cursor=inbox.nextCursor;this.status.set(status);this.notices.set([...inbox.items,...this.notices().filter(n=>!inbox.items.some(latest=>latest.id===n.id))]);if(!this.historyLoaded)this.more.set(inbox.hasMore);this.error.set('');
   if(this.selected())setTimeout(()=>document.getElementById('agent-notice-'+this.selected())?.scrollIntoView({block:'nearest'}),0);
  } catch(e){if(!this.destroyed)this.error.set('לא ניתן לטעון את הסוכן כרגע. אפשר לנסות שוב.');}
  finally{this.reading=false;this.loading.set(false);}
 }
 ready() {return !!this.status()?.connected && this.status()?.businesses.some(b=>!b.missing.length);}
 async act(action:()=>Promise<unknown>) {
  if(this.busy())return;this.busy.set(true);this.error.set('');
  try{await action();}catch(e){this.error.set((e as {error?:{message?:string}})?.error?.message || 'הפעולה לא הושלמה. אפשר לנסות שוב.');}
  finally{this.busy.set(false);}
  if(!this.error())await this.refresh();
 }
 start(){void this.act(()=>this.api.start());}
 toggle(event:Event) {const input=event.target as HTMLInputElement;const value=input.checked;input.checked=!!this.status()?.enabled;void this.act(()=>this.api.consent(value));}
 async mark(n:AgentNotice){await this.act(()=>this.api.read(n.id));}
 reply(n:AgentNotice){
  const answer=this.answers[n.id]?.trim();if(!answer || (!this.status()?.enabled && !this.ready()))return;
  const owner=this.api.context();if(!owner)return;
  void this.act(async()=>{
   if(!this.status()?.enabled){await this.api.consent(true);if(owner!==this.api.context())throw new Error('IDENTITY_CHANGED');this.status.update(s=>s?{...s,enabled:true}:s);}
   if(owner!==this.api.context())throw new Error('IDENTITY_CHANGED');
   await this.api.reply(n.id,answer);delete this.answers[n.id];
   this.notices.update(rows=>rows.map(row=>row.id===n.id?{...row,state:'pending',question:null,reason:'התשובה נשלחה לבדיקה נוספת.',read_at:new Date().toISOString()}:row));
  });
 }
 paymentLabel(n:AgentNotice){const d=n.display;return d.paymentIdentifier?`${d.paymentType==='BANK_ACCOUNT'?'חשבון בנק':d.paymentType==='CREDIT_CARD'?'כרטיס אשראי':'אמצעי תשלום'} ${d.paymentIdentifier}${d.paymentRole==='spouse'?' · בן/בת הזוג':''}`:'אמצעי התשלום אינו זמין';}
 associate(s:AgentStatus['unlinked'][number]) {
  if(this.busy() || !this.api.context() || !this.status()?.unlinked.some(source=>source.id===s.id))return;
  this.transactions.accountsList.set([]);this.transactions.getAllBills();
  this.addingAccount.set(false);
  this.associationRow.set({paymentIdentifier:s.sourceName,sourceRecordId:s.id,sourceType:s.sourceType});
 }
 closeAssociation(event:{visible:boolean;data:boolean}) {
  if(!event.visible){this.associationRow.set(null);this.addingAccount.set(false);}
  if(event.data)void this.refresh();
 }
 closeAddAccount(event:{visible:boolean;data?:boolean}) {this.addingAccount.set(event.visible);}
 async loadMore(){const rows=this.notices();if(!rows.length || this.busy())return;this.busy.set(true);
  try{const result=await this.api.inbox(this.cursor || undefined);if(!this.destroyed){this.historyLoaded=true;this.notices.update(current=>[...current,...result.items.filter(n=>!current.some(old=>old.id===n.id))]);this.more.set(result.hasMore);this.cursor=result.nextCursor;}}catch{this.error.set('לא ניתן לטעון הודעות קודמות.');}finally{this.busy.set(false);}}
 label(state:string){return ({classified:'סווג באמצעות כלל קבוע',waiting:'ממתין לתשובה שלך',failed:'הסיווג לא הושלם',blocked:'נדרשת בדיקה',resolved:'טופל ידנית',pending:'בתור',retry:'ממתין לניסיון נוסף'} as Record<string,string>)[state] || state;}
}
