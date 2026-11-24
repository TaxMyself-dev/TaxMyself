import { TestBed } from '@angular/core/testing';
import { convertToParamMap, Router, provideRouter } from '@angular/router';
import { ModuleAccessGuard } from './module-access.guard';
import { BillingStateService } from '../../services/billing-state.service';
import { AccessService } from '../../services/access.service';
import { UpgradeRequiredService } from '../../services/upgrade-required.service';
import { AppRoute } from '../access-control';
describe('AI module route guard',()=>{
  function setup(allowed:boolean,unverified=false){
    const open=jasmine.createSpy();
    TestBed.configureTestingModule({providers:[provideRouter([]),
      {provide:BillingStateService,useValue:{loadBillingState:async()=>{},isUnverified:()=>unverified,isPaymentRequired:()=>false}},
      {provide:AccessService,useValue:{canAccessRoute:()=>allowed}},
      {provide:UpgradeRequiredService,useValue:{open}}]});
    return {guard:TestBed.inject(ModuleAccessGuard),router:TestBed.inject(Router),open};
  }
  const route:any={data:{appRoute:AppRoute.AI},queryParamMap:convertToParamMap({})};
  it('allows an entitled user',async()=>{const f=setup(true);expect(await f.guard.canActivate(route)).toBeTrue();});
  it('redirects denied users without advertising an upgrade',async()=>{
    const f=setup(false);expect(f.router.serializeUrl(await f.guard.canActivate(route) as any)).toBe('/my-account');expect(f.open).not.toHaveBeenCalled();
  });
  it('fails closed when subscription state is unverified',async()=>{
    const f=setup(true,true);expect(f.router.serializeUrl(await f.guard.canActivate(route) as any)).toBe('/my-account');expect(f.open).not.toHaveBeenCalled();
  });
});
