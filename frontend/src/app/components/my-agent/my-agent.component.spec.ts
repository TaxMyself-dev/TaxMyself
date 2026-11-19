import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MyAgentComponent } from './my-agent.component';
import { MyAgentService } from './my-agent.service';
import { signal } from '@angular/core';
describe('My Agent settings',()=>{
 const status=()=>({available:true,enabled:false,connected:true,noticeSeen:false,lastError:null,pending:9,businesses:[{number:'biz',name:'עסק',missing:[]}],unlinked:[],bills:[],counts:[]});
 function setup(overrides:any={}){
  const api:any={context:()=> 'owner',status:jasmine.createSpy().and.resolveTo({...status(),...overrides}),inbox:jasmine.createSpy().and.resolveTo({items:[],hasMore:false,nextCursor:null}),
   consent:jasmine.createSpy().and.resolveTo({}),start:jasmine.createSpy().and.resolveTo({}),read:jasmine.createSpy().and.resolveTo({}),reply:jasmine.createSpy().and.resolveTo({}),associate:jasmine.createSpy().and.resolveTo({})};
  TestBed.configureTestingModule({imports:[MyAgentComponent],providers:[provideRouter([]),{provide:MyAgentService,useValue:api},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({})}}}]});
  const fixture=TestBed.createComponent(MyAgentComponent);fixture.detectChanges();return {fixture,api};
 }
 it('renders the user-wide switch, rules disclosure and pending count',fakeAsync(()=>{const f=setup();tick();f.fixture.detectChanges();const el=f.fixture.nativeElement as HTMLElement;expect(el.textContent).toContain('לכל העסקים שלך');expect(el.textContent).toContain('כללים קבועים');expect(el.textContent).toContain('9 תנועות');expect(el.querySelector<HTMLInputElement>('[role=switch]').disabled).toBeFalse();f.fixture.destroy();}));
 it('blocks opt-in until the business onboarding is complete',fakeAsync(()=>{const f=setup({businesses:[{number:'biz',name:'עסק',missing:[{key:'vehicle',label:'רכב'}]}]});tick();f.fixture.detectChanges();expect(f.fixture.nativeElement.querySelector('[role=switch]').disabled).toBeTrue();expect(f.fixture.nativeElement.textContent).toContain('ההיכרות עדיין חסרה');expect(f.api.consent).not.toHaveBeenCalled();f.fixture.destroy();}));
 it('still permits opt-out when banking disconnected',fakeAsync(()=>{const f=setup({enabled:true,connected:false});tick();f.fixture.detectChanges();expect(f.fixture.nativeElement.querySelector('[role=switch]').disabled).toBeFalse();f.fixture.destroy();}));
 it('does not claim a changed switch until the server accepts',fakeAsync(()=>{const f=setup();tick();f.fixture.detectChanges();const input=f.fixture.nativeElement.querySelector('[role=switch]');input.checked=true;input.dispatchEvent(new Event('change'));expect(input.checked).toBeFalse();expect(f.api.consent).toHaveBeenCalledOnceWith(true);tick();f.fixture.destroy();}));
 it('keeps read and resolution separate',fakeAsync(()=>{const f=setup({enabled:true});const n:any={id:'id',state:'waiting',business_number:'biz',reason:'חסר מידע',question:'מה נרכש?',read_at:null,updated_at:'2026-11-19',display:{merchant:'חנות',date:'2026-11-19',amount:-10,currency:'ILS',account:'חשבון'}};f.api.inbox.and.resolveTo({items:[n],hasMore:false,nextCursor:null});tick();f.fixture.detectChanges();f.fixture.componentInstance.mark(n);tick();expect(f.api.read).toHaveBeenCalledWith('id');expect(f.api.reply).not.toHaveBeenCalled();expect(f.fixture.nativeElement.textContent).toContain('מה נרכש?');f.fixture.destroy();}));
 it('never renders previous owner data after identity changes during load',fakeAsync(()=>{const f=setup();f.api.context=()=>null;tick();f.fixture.detectChanges();expect(f.fixture.componentInstance.status()).toBeNull();expect(f.fixture.componentInstance.notices()).toEqual([]);f.fixture.destroy();}));
});
