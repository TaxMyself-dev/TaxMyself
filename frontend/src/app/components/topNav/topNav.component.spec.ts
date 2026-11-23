import { MyAgentService } from '../my-agent/my-agent.service';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TopNavComponent } from './topNav.component';
import { MenuButtonComponent } from '../menu-button/menu-button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
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
    TestBed.configureTestingModule({imports:[TopNavComponent,NoopAnimationsModule],providers:[provideRouter([]),{provide:MyAgentService,useValue:{context:()=>null,unread:signal(0)}},
      {provide:AccessService,useValue:{getFeatureState:()=>({visible:false})}},
      {provide:AccessHandlerService,useValue:{}},
      {provide:RuntimeContextService,useValue:{isInstalledPwa:installed}},
      {provide:AppRefreshService,useValue:{isRefreshing:refreshing,refreshSharedState:refresh}},
    ]});
  });
  for (const admin of [false, true]) {
    it(`opens canonical settings directly without a menu for ${admin ? 'admin' : 'customer'}`, () => {
      const f=TestBed.createComponent(TopNavComponent);f.componentRef.setInput('isAdmin',admin);f.detectChanges();
      const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
      const buttons=f.debugElement.queryAll(By.directive(ButtonComponent));
      expect(buttons.length).toBe(1);
      expect(buttons[0].componentInstance.buttonColor()).toBe(ButtonColor.TRANSPARET);
      expect(buttons[0].componentInstance.buttonSize()).toBe(ButtonSize.ICON);
      expect(buttons[0].componentInstance.variant()).toBe('text');
      buttons[0].query(By.css('button')).nativeElement.click();
      expect(navigate).toHaveBeenCalledOnceWith(['/settings']);
      expect(f.debugElement.query(By.directive(MenuButtonComponent))).toBeNull();
      expect(f.nativeElement.textContent).not.toContain('הגדרות ישנות');
      expect(f.nativeElement.querySelector('[aria-haspopup="menu"]')).toBeNull();
      f.destroy();
    });
  }
  for (const admin of [false,true]) it(`retains installed-PWA refresh for admin=${admin}`, () => {
    installed.set(true);const f=TestBed.createComponent(TopNavComponent);f.componentRef.setInput('isAdmin',admin);f.detectChanges();
    const button=f.debugElement.queryAll(By.directive(ButtonComponent)).find(x=>x.componentInstance.icon()==='pi pi-refresh')!;
    button.query(By.css('button')).nativeElement.click();expect(refresh).toHaveBeenCalledTimes(1);
    refreshing.set(true);f.detectChanges();expect(button.query(By.css('button')).nativeElement.disabled).toBeTrue();f.destroy();
  });
});
