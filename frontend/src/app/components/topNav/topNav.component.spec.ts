import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TopNavComponent } from './topNav.component';
import { ButtonComponent } from '../button/button.component';
import { AccessService } from '../../services/access.service';
import { AccessHandlerService } from '../../services/access-handler.service';
import { RuntimeContextService } from '../../services/pwa/runtime-context.service';
import { AppRefreshService } from '../../services/pwa/app-refresh.service';

describe('settings navigation entry', () => {
  const installed=signal(false),refreshing=signal(false);
  let refresh: jasmine.Spy;
  beforeEach(() => {
    installed.set(false);refreshing.set(false);refresh=jasmine.createSpy().and.returnValue(Promise.resolve());
    TestBed.configureTestingModule({imports:[TopNavComponent,NoopAnimationsModule],providers:[provideRouter([]),
      {provide:AccessService,useValue:{getFeatureState:()=>({visible:false})}},
      {provide:AccessHandlerService,useValue:{}},
      {provide:RuntimeContextService,useValue:{isInstalledPwa:installed}},
      {provide:AppRefreshService,useValue:{isRefreshing:refreshing,refreshSharedState:refresh}},
    ]});
  });
  it('opens new settings directly for a customer without a menu or legacy/logout button', () => {
    const f=TestBed.createComponent(TopNavComponent);f.detectChanges();
    const navigate=spyOn(TestBed.inject(Router),'navigate').and.returnValue(Promise.resolve(true));
    const buttons=f.debugElement.queryAll(By.directive(ButtonComponent));
    expect(buttons.length).toBe(1);expect(buttons[0].componentInstance.buttonText()).toBe('הגדרות');
    buttons[0].query(By.css('button')).nativeElement.click();
    expect(navigate).toHaveBeenCalledOnceWith(['/settings-new']);
    expect(f.nativeElement.querySelector('app-menu-button')).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('הגדרות ישנות');
    expect(f.nativeElement.textContent).not.toContain('התנתקות');
    f.componentInstance.openLegacySettings();expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('adds legacy settings only for an admin', () => {
    const f=TestBed.createComponent(TopNavComponent);f.componentRef.setInput('isAdmin',true);f.detectChanges();
    const navigate=spyOn(TestBed.inject(Router),'navigate').and.returnValue(Promise.resolve(true));
    const old=f.debugElement.queryAll(By.directive(ButtonComponent)).find(x=>x.componentInstance.buttonText()==='הגדרות ישנות')!;
    old.query(By.css('button')).nativeElement.click();expect(navigate).toHaveBeenCalledOnceWith(['/settings']);
    f.componentRef.setInput('isAdmin',false);f.detectChanges();expect(f.nativeElement.textContent).not.toContain('הגדרות ישנות');
  });
  it('retains a separate installed-PWA refresh action and busy guard', () => {
    installed.set(true);const f=TestBed.createComponent(TopNavComponent);f.detectChanges();
    const button=f.debugElement.queryAll(By.directive(ButtonComponent)).find(x=>x.componentInstance.icon()==='pi pi-refresh')!;
    button.query(By.css('button')).nativeElement.click();expect(refresh).toHaveBeenCalledTimes(1);
    refreshing.set(true);f.detectChanges();expect(button.query(By.css('button')).nativeElement.disabled).toBeTrue();
  });
});
