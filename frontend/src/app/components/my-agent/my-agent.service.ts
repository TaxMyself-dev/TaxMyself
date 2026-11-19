import { Injectable, inject, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClientPanelService } from '../../services/clients-panel.service';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from '../../services/auth.service';
export interface AgentStatus {
 available:boolean; enabled:boolean; connected:boolean; noticeSeen:boolean; pending?:number; lastError:string|null;
 businesses:{number:string;name:string;missing:{key:string;label:string}[]}[];
 unlinked:{id:number;sourceName:string;sourceType:string;connectionRole:string}[];
 bills:{id:number;billName:string;businessNumber:string}[];
 counts:{state:string;count:number|string}[];
}
export interface AgentNotice {
 id:string;business_number:string;state:string;reason:string;question:string|null;read_at:string|null;updated_at:string;
 category:string|null;sub_category:string|null;
 display:{merchant:string;date:string;amount:number;currency:string;account:string};
}
@Injectable({providedIn:'root'})
export class MyAgentService {
 private readonly http=inject(HttpClient);private readonly auth=inject(AuthService);
 private readonly base=environment.apiUrl.replace(/\/?$/,'/')+'api/agent-automation';
 readonly unread=signal(0);
 private identity:string|null=null;
 private readonly client=signal<string|null>(null);
 constructor(){inject(ClientPanelService).selectedClientId$.pipe(takeUntilDestroyed()).subscribe(id=>this.client.set(id));effect(()=>{const owner=this.context();if(owner!==this.identity){this.identity=owner;this.unread.set(0);}});}
 context() { return !this.client() && !this.auth.isViewingAsClient() ? this.auth.currentUser()?.uid ?? null : null; }
 private capture() { const next=this.context();if(next!==this.identity){this.unread.set(0);this.identity=next;}return next; }
 async status() { const owner=this.capture();if(!owner)throw new Error('OWNER_REQUIRED');const result=await firstValueFrom(this.http.get<AgentStatus>(this.base));if(owner!==this.context())throw new Error('IDENTITY_CHANGED');return result; }
 consent(enabled:boolean) {return firstValueFrom(this.http.post<AgentStatus>(this.base+'/consent',{enabled}));}
 dismiss() {return firstValueFrom(this.http.post(this.base+'/dismiss',{}));}
 start() {return firstValueFrom(this.http.post(this.base+'/start',{}));}
 async inbox(before?:string) {
   const owner=this.capture();
   const result=await firstValueFrom(this.http.get<{items:AgentNotice[];unread:number;hasMore:boolean;nextCursor:string|null}>(this.base+'/notifications',{params:before?{before}:{}}));
   if(owner!==this.context()) throw new Error('IDENTITY_CHANGED');
   this.unread.set(result.unread);return result;
 }
 notice(id:string){return firstValueFrom(this.http.get<AgentNotice>(this.base+'/notifications/'+encodeURIComponent(id)));}
 read(id:string) {return firstValueFrom(this.http.post(this.base+'/notifications/'+encodeURIComponent(id)+'/read',{}));}
 reply(id:string,answer:string) {return firstValueFrom(this.http.post(this.base+'/notifications/'+encodeURIComponent(id)+'/reply',{answer}));}
 associate(source:AgentStatus['unlinked'][number],billId:number) {
  return firstValueFrom(this.http.post(environment.apiUrl.replace(/\/?$/,'/')+'transactions/'+billId+'/sources',
    {sourceName:source.sourceName,sourceType:source.sourceType,sourceRecordId:source.id}));
 }
}
