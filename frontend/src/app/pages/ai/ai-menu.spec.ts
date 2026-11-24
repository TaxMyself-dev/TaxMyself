import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { AppComponent } from '../../app.component';
import { MyAgentService } from '../../components/my-agent/my-agent.service';
import { AccessService } from '../../services/access.service';
import { BillingStateService } from '../../services/billing-state.service';
import { GenericService } from '../../services/generic.service';
import { StartupService } from '../../services/startup.service';
import { NetworkStatusService } from '../../services/pwa/network-status.service';
import { AppRefreshService } from '../../services/pwa/app-refresh.service';
describe('main AI menu',()=>{
  it('reacts to AI owner eligibility independently of the admin menu',()=>{
    const owner=signal<string|null>(null);
    TestBed.configureTestingModule({providers:[
      {provide:MyAgentService,useValue:{context:owner}},
      {provide:GenericService,useValue:{businesses:signal([])}},
      {provide:BillingStateService,useValue:{billingState:signal(null),isLoading:signal(false),error:signal(null)}},
      {provide:AccessService,useValue:{getFeatureState:()=>({visible:true})}},
      {provide:NetworkStatusService,useValue:{reconnectedAt:signal(0)}},
      {provide:AppRefreshService,useValue:{refreshSharedState:async()=>{}}},
      {provide:StartupService,useValue:{whenReady:async()=>{},releaseStartupLoader:()=>{}}},
    ]});
    const app=TestBed.runInInjectionContext(()=>new AppComponent({} as any,{events:NEVER} as any,{} as any,{} as any,{} as any,{} as any));
    expect(app.menuItems().some(item=>item.routerLink==='/ai')).toBeFalse();
    owner.set('entitled-regular');expect(app.menuItems().some(item=>item.routerLink==='/ai')).toBeTrue();
    expect(app.menuItems().some(item=>item.routerLink==='/admin-panel')).toBeFalse();
    owner.set(null);expect(app.menuItems().some(item=>item.routerLink==='/ai')).toBeFalse();
  });
});
