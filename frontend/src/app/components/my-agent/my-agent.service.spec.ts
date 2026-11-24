import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { signal } from '@angular/core';
import { MyAgentService } from './my-agent.service';
import { AuthService } from '../../services/auth.service';
import { ClientPanelService } from '../../services/clients-panel.service';
import { AccessService } from '../../services/access.service';
describe('My Agent identity and association',()=>{
 function setup(){const uid=signal<any>({uid:'owner'}),selected=new BehaviorSubject<string|null>(null),profile=new BehaviorSubject({role:['REGULAR']}),allowed=signal(true);
  TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),{provide:AccessService,useValue:{canAccessModule:()=>allowed()}},{provide:AuthService,useValue:{currentUser:uid,isViewingAsClient:()=>false,ownerProfileUpdates$:profile,getRealUserDataFromLocalStorage:()=>profile.value}},{provide:ClientPanelService,useValue:{selectedClientId$:selected}}]});
  return {api:TestBed.inject(MyAgentService),http:TestBed.inject(HttpTestingController),uid,selected,profile,allowed};}
 afterEach(()=>TestBed.inject(HttpTestingController).verify());
 it('uses stable source ID and the existing owner-scoped source API',fakeAsync(()=>{const f=setup();void f.api.associate({id:7,sourceName:'כרטיס',sourceType:'CARD',connectionRole:'primary'},4);const request=f.http.expectOne(r=>r.url.endsWith('/transactions/4/sources'));expect(request.request.body.sourceRecordId).toBe(7);request.flush({});tick();}));
 it('drops an old owner response rather than updating the bell',fakeAsync(()=>{const f=setup();let rejected=false;void f.api.inbox().catch(()=>rejected=true);const request=f.http.expectOne(r=>r.url.endsWith('/notifications'));f.uid.set({uid:'other'});request.flush({items:[],unread:8,hasMore:false,nextCursor:null});tick();expect(rejected).toBeTrue();expect(f.api.unread()).toBe(0);}));
 it('detects represented-client context immediately',()=>{const f=setup();f.selected.next('client');expect(f.api.context()).toBeNull();});
 it('allows a regular owner with AI and hides it immediately on revocation',()=>{const f=setup();expect(f.api.context()).toBe('owner');f.allowed.set(false);expect(f.api.canAccessAi()).toBeFalse();expect(f.api.context()).toBeNull();});
 it('does not let the admin role bypass missing AI access',()=>{const f=setup();f.profile.next({role:['ADMIN']});f.allowed.set(false);expect(f.api.context()).toBeNull();});

});
