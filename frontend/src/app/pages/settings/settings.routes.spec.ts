import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthGuard } from '../../shared/guard/auth.guard';
import { BillingGuard } from '../../shared/guard/billing.guard';
import { SettingsNewPage } from '../settings-new/settings-new.page';
import { SETTINGS_ROUTES } from './settings.routes';

@Component({standalone:true,template:'settings'})
class SettingsStub {}

describe('canonical settings route',()=>{
 let auth:jasmine.Spy, billing:jasmine.Spy;
 beforeEach(()=>{
  auth=jasmine.createSpy().and.returnValue(true);billing=jasmine.createSpy().and.returnValue(true);
  TestBed.configureTestingModule({providers:[
   provideRouter([{path:'',pathMatch:'full',component:SettingsStub},...SETTINGS_ROUTES.map(route=>route.path==='settings'?{...route,loadComponent:()=>Promise.resolve(SettingsStub)}:route)]),
   {provide:AuthGuard,useValue:{canActivate:auth}},{provide:BillingGuard,useValue:{canActivate:billing}},
  ]});
 });
 it('loads the redesigned screen at the original URL with unchanged guards',async()=>{
  const canonical=SETTINGS_ROUTES.find(route=>route.path==='settings')!;
  expect(canonical.canActivate).toEqual([AuthGuard,BillingGuard]);
  expect(await canonical.loadComponent!()).toBe(SettingsNewPage);
  const harness=await RouterTestingHarness.create();await harness.navigateByUrl('/settings',SettingsStub);
  expect(TestBed.inject(Router).url).toBe('/settings');expect(auth).toHaveBeenCalled();expect(billing).toHaveBeenCalled();
 });
 it('redirects old new-settings bookmarks while preserving OAuth, agent and fragment state',async()=>{
  const harness=await RouterTestingHarness.create();await harness.navigateByUrl('/settings-new?tab=permissions&googleIntegration=success&section=agent&notice=n#banking',SettingsStub);
  const url=TestBed.inject(Router).parseUrl(TestBed.inject(Router).url);
  expect(url.root.children['primary'].segments[0].path).toBe('settings');
  expect(url.queryParams).toEqual({tab:'permissions',googleIntegration:'success',section:'agent',notice:'n'});
  expect(url.fragment).toBe('banking');expect(auth).toHaveBeenCalled();expect(billing).toHaveBeenCalled();
 });
 for(const path of ['/settings','/settings-new'])it(`retains authentication on ${path}`,async()=>{
  auth.and.returnValue(false);const harness=await RouterTestingHarness.create();await harness.navigateByUrl(path);
  expect(TestBed.inject(Router).url).toBe('/');expect(billing).not.toHaveBeenCalled();
 });
 it('retains the billing gate',async()=>{
  billing.and.returnValue(false);const harness=await RouterTestingHarness.create();await harness.navigateByUrl('/settings');
  expect(TestBed.inject(Router).url).toBe('/');
 });
});
