import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppRoutingModule } from '../../app-routing.module';
import { AppRoute, BlockedBehavior, ModuleName, ROUTE_ACCESS_CONFIG } from '../../shared/access-control';
import { AdminRouteGuard } from '../../shared/guard/admin-route.guard';
import { ModuleAccessGuard } from '../../shared/guard/module-access.guard';
import { AiPage } from './ai.page';
describe('AI module navigation',()=>{
  it('offers chat, onboarding and agent management in the ordinary application',()=>{
    TestBed.configureTestingModule({imports:[AiPage],providers:[provideRouter([])]});
    const fixture=TestBed.createComponent(AiPage);fixture.detectChanges();
    const links=[...fixture.nativeElement.querySelectorAll('nav a')] as HTMLAnchorElement[];
    expect(links.map(link=>link.getAttribute('href'))).toEqual(['/agent/chat','/agent/onboarding','/agent/automation']);
    expect(links.some(link=>link.textContent.includes('היכרות'))).toBeTrue();
  });
  it('protects every AI screen by module access rather than the admin role',()=>{
    TestBed.configureTestingModule({imports:[AppRoutingModule]});
    const shell=TestBed.inject(Router).config.find(route=>route.children?.some(child=>child.path==='ai'));
    for(const path of ['ai','agent/chat','agent/onboarding','agent/automation']){
      const route=shell.children.find(route=>route.path===path);
      expect(route.data['appRoute']).toBe(AppRoute.AI);
      expect(route.canActivate).toContain(ModuleAccessGuard);
      expect(route.canActivate).not.toContain(AdminRouteGuard);
    }
    expect(ROUTE_ACCESS_CONFIG[AppRoute.AI].requiredModule).toBe(ModuleName.AI);
    expect(ROUTE_ACCESS_CONFIG[AppRoute.AI].blockedBehavior).toBe(BlockedBehavior.HIDE);
    expect(shell.children.find(route=>route.path==='admin-panel').canActivate).toContain(AdminRouteGuard);
  });
});
