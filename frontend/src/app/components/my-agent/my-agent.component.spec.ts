import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { TransactionsService } from '../../pages/transactions/transactions.page.service';
import { AuthService } from '../../services/auth.service';
import { GenericService } from '../../services/generic.service';
import { NetworkStatusService } from '../../services/pwa/network-status.service';
import { AccountAssociationDialogComponent } from '../account-association-dialog/account-association-dialog.component';
import { AddBillComponent } from '../add-bill/add-bill.component';
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
  const transactions={accountsList:signal([]),getAllBills:jasmine.createSpy('getAllBills'),addSource:jasmine.createSpy('addSource').and.returnValue(of({})),addBill:jasmine.createSpy('addBill').and.returnValue(of({}))};
  TestBed.overrideComponent(MyAgentComponent,{set:{providers:[{provide:TransactionsService,useValue:transactions}]}});
  TestBed.configureTestingModule({imports:[MyAgentComponent],providers:[provideRouter([]),provideNoopAnimations(),MessageService,
   {provide:AuthService,useValue:{getUserDataFromLocalStorage:()=>({businessNumber:'biz'})}},
   {provide:GenericService,useValue:{businessSelectItems:signal([{name:'עסק',value:'biz'}])}},
   {provide:NetworkStatusService,useValue:{isOnline:signal(true)}},{provide:MyAgentService,useValue:api},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({})}}}]});
  const fixture=TestBed.createComponent(MyAgentComponent);fixture.detectChanges();return {fixture,api,transactions};
 }
 it('renders the user-wide switch, rules disclosure and pending count',fakeAsync(()=>{const f=setup();tick();f.fixture.detectChanges();const el=f.fixture.nativeElement as HTMLElement;expect(el.textContent).toContain('לכל העסקים שלך');expect(el.textContent).toContain('כללים קבועים');expect(el.textContent).toContain('9 תנועות');expect(el.querySelector<HTMLInputElement>('[role=switch]').disabled).toBeFalse();f.fixture.destroy();}));
 it('blocks opt-in until the business onboarding is complete',fakeAsync(()=>{const f=setup({businesses:[{number:'biz',name:'עסק',missing:[{key:'vehicle',label:'רכב'}]}]});tick();f.fixture.detectChanges();expect(f.fixture.nativeElement.querySelector('[role=switch]').disabled).toBeTrue();expect(f.fixture.nativeElement.textContent).toContain('ההיכרות עדיין חסרה');expect(f.api.consent).not.toHaveBeenCalled();f.fixture.destroy();}));
 it('still permits opt-out when banking disconnected',fakeAsync(()=>{const f=setup({enabled:true,connected:false});tick();f.fixture.detectChanges();expect(f.fixture.nativeElement.querySelector('[role=switch]').disabled).toBeFalse();f.fixture.destroy();}));
 it('does not claim a changed switch until the server accepts',fakeAsync(()=>{const f=setup();tick();f.fixture.detectChanges();const input=f.fixture.nativeElement.querySelector('[role=switch]');input.checked=true;input.dispatchEvent(new Event('change'));expect(input.checked).toBeFalse();expect(f.api.consent).toHaveBeenCalledOnceWith(true);tick();f.fixture.destroy();}));
 it('keeps read and resolution separate',fakeAsync(()=>{const f=setup({enabled:true});const n:any={id:'id',state:'waiting',business_number:'biz',reason:'חסר מידע',question:'מה נרכש?',read_at:null,updated_at:'2026-11-19',display:{merchant:'חנות',date:'2026-11-19',amount:-10,currency:'ILS',account:'חשבון'}};f.api.inbox.and.resolveTo({items:[n],hasMore:false,nextCursor:null});tick();f.fixture.detectChanges();f.fixture.componentInstance.mark(n);tick();expect(f.api.read).toHaveBeenCalledWith('id');expect(f.api.reply).not.toHaveBeenCalled();expect(f.fixture.nativeElement.textContent).toContain('מה נרכש?');f.fixture.destroy();}));
 it('never renders previous owner data after identity changes during load',fakeAsync(()=>{const f=setup();f.api.context=()=>null;tick();f.fixture.detectChanges();expect(f.fixture.componentInstance.status()).toBeNull();expect(f.fixture.componentInstance.notices()).toEqual([]);f.fixture.destroy();}));
 it('opens the shared drawer without any accounts, adds one, and associates the exact source',fakeAsync(()=>{
  const source={id:81,sourceName:'9081',sourceType:'BANK_ACCOUNT',connectionRole:'spouse'};
  const f=setup({unlinked:[source]});tick();f.fixture.detectChanges();
  const el=f.fixture.nativeElement as HTMLElement;
  expect(el.querySelector('.source select')).toBeNull();
  const button=el.querySelector<HTMLButtonElement>('.source app-p-button button');
  expect(button.disabled).toBeFalse();expect(button.classList.contains('black')).toBeTrue();
  button.click();f.fixture.detectChanges();tick();
  let drawer=f.fixture.debugElement.query(By.directive(AccountAssociationDialogComponent)).componentInstance as AccountAssociationDialogComponent;
  expect(drawer.rowData()['sourceRecordId']).toBe(81);
  expect(drawer.accounts()).toEqual([]);
  drawer.openAddBill();f.fixture.detectChanges();tick();
  const add=f.fixture.debugElement.query(By.directive(AddBillComponent)).componentInstance as AddBillComponent;
  add.myForm.patchValue({accountName:'חשבון חדש',businessNumber:'biz'});
  f.transactions.getAllBills.and.callFake(()=>f.transactions.accountsList.set([{value:42,name:'חשבון חדש'}]));
  add.addBill(add.myForm);f.fixture.detectChanges();tick();
  expect(f.transactions.addBill).toHaveBeenCalledWith('חשבון חדש','biz');
  expect(f.fixture.componentInstance.addingAccount()).toBeFalse();
  drawer=f.fixture.debugElement.query(By.directive(AccountAssociationDialogComponent)).componentInstance;
  expect(drawer.accounts()).toEqual([{value:42,name:'חשבון חדש'}]);
  drawer.myForm.patchValue({account:42});drawer.associationPaymentMethod(42);tick();f.fixture.detectChanges();
  expect(f.transactions.addSource).toHaveBeenCalledOnceWith(42,'9081','BANK_ACCOUNT',81);
  expect(f.fixture.componentInstance.associationRow()).toBeNull();
  expect(f.api.status.calls.count()).toBeGreaterThan(1);
  f.fixture.destroy();tick();
 }));
 it('returns from cancelled account creation to the selected source without writing',fakeAsync(()=>{
  const source={id:9,sourceName:'0013',sourceType:'CREDIT_CARD',connectionRole:'primary'};
  const f=setup({unlinked:[source]});tick();f.fixture.componentInstance.associate(source);f.fixture.detectChanges();tick();
  f.fixture.componentInstance.addingAccount.set(true);f.fixture.detectChanges();tick();
  f.fixture.debugElement.query(By.directive(AddBillComponent)).componentInstance.onVisibleChange(false);
  f.fixture.detectChanges();tick();
  expect(f.fixture.componentInstance.associationRow()['sourceRecordId']).toBe(9);
  expect(f.transactions.addBill).not.toHaveBeenCalled();expect(f.transactions.addSource).not.toHaveBeenCalled();
  f.fixture.destroy();tick();
 }));

 it('keeps questions collapsed with visible payment details and a clear new badge',fakeAsync(()=>{
  const f=setup({enabled:true});const n:any={id:'notice',state:'waiting',business_number:'biz',reason:'חסר מידע',question:'מה נרכש?',read_at:null,updated_at:'2026-11-19',display:{merchant:'עסק',amount:-10,currency:'ILS',date:'2026-11-19',account:'שמואל',paymentIdentifier:'9081',paymentType:'CREDIT_CARD',paymentRole:'spouse'}};
  f.api.inbox.and.resolveTo({items:[n],hasMore:false,nextCursor:null});tick();f.fixture.detectChanges();
  const details=f.fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
  expect(details.open).toBeFalse();expect(details.querySelector('summary').textContent).toContain('כרטיס אשראי 9081');expect(details.querySelector('summary').textContent).toContain('בן/בת הזוג');expect(details.querySelector('.new-badge').textContent).toContain('חדש');
  details.querySelector('summary').click();expect(details.open).toBeTrue();f.fixture.destroy();
 }));
 it('explicitly activates automation before sending a reply when it is off',fakeAsync(()=>{
  const f=setup();const n:any={id:'n',state:'waiting',business_number:'biz',reason:'חסר מידע',question:'מה נרכש?',read_at:null,updated_at:'2026-11-19',display:{merchant:'חנות',amount:-10,currency:'ILS',date:'2026-11-19',account:'חשבון'}};
  f.api.inbox.and.resolveTo({items:[n],hasMore:false,nextCursor:null});tick();f.fixture.componentInstance.answers['n']='הלוואה עסקית';f.fixture.detectChanges();
  const button=f.fixture.nativeElement.querySelector('.reply-button') as HTMLButtonElement;
  expect(button.disabled).toBeFalse();expect(button.textContent).toContain('הפעל סיווג אוטומטי');f.api.inbox.and.resolveTo({items:[],hasMore:false,nextCursor:null});button.click();tick();
  expect(f.api.consent).toHaveBeenCalledOnceWith(true);expect(f.api.reply).toHaveBeenCalledOnceWith('n','הלוואה עסקית');expect(f.fixture.componentInstance.answers['n']).toBeUndefined();expect(f.fixture.componentInstance.notices()[0].state).toBe('pending');f.fixture.destroy();
 }));
 it('does not send a reply if enabling consent fails and keeps the draft',fakeAsync(()=>{
  const f=setup();tick();f.api.consent.and.rejectWith({error:{message:'אין הרשאה'}});f.fixture.componentInstance.answers['n']='תשובה';f.fixture.componentInstance.reply({id:'n'} as any);tick();
  expect(f.api.reply).not.toHaveBeenCalled();expect(f.fixture.componentInstance.answers['n']).toBe('תשובה');expect(f.fixture.componentInstance.error()).toBe('אין הרשאה');f.fixture.destroy();
 }));

});
