import { FormBuilder } from '@angular/forms';
import { convertToParamMap } from '@angular/router';
import { AdminPanelPage, AI_CHAT_TAB, aiChatTabs } from './admin-panel.page';
import { DEV_AGENT_PATH, devAgentRouteEnabled } from '../dev-agent/dev-agent.route';

describe('AdminPanelPage', () => {
  let component: AdminPanelPage;
  let router: jasmine.SpyObj<{ navigate: (...args: unknown[]) => Promise<boolean> }>;
  let query: Record<string, string>;

  beforeEach(() => {
    query = {};
    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    const route = { get snapshot() { return { queryParamMap: convertToParamMap(query) }; } };
    component = new AdminPanelPage(new FormBuilder(), {} as any, router as any, route as any);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('combines categories and cards under one top-level catalog tab', () => {
    expect(component.tabs.map((tab) => tab.value)).toContain('catalog-management');
    expect(component.tabs.map((tab) => tab.value)).not.toContain('category-management');
    expect(component.tabs.map((tab) => tab.value)).not.toContain('booking-account-catalog');
    expect(component.catalogTabs.map((tab) => tab.value)).toEqual(['categories', 'cards']);
  });

  it('includes the educational content tab', () => {
    expect(component.tabs.map((tab) => tab.value)).toContain('content');
  });

  it('includes the admin-only tax file tab', () => {
    expect(component.tabs.map((tab) => tab.value)).toContain('tax-file');
  });

  it('switches between the nested catalog tabs', () => {
    component.onCatalogTabChange('cards');
    expect(component.selectedCatalogTab).toBe('cards');

    component.onCatalogTabChange('unexpected');
    expect(component.selectedCatalogTab).toBe('categories');
  });

  describe('AI chat entry', () => {

    it('is shown exactly when the chat route is enabled (same flag as the route)', () => {
      const shown = component.tabs.some((tab) => tab.value === AI_CHAT_TAB);
      expect(shown).toBe(devAgentRouteEnabled());
    });

    it('is hidden when the chat route is disabled', () => {
      expect(aiChatTabs(false)).toEqual([]);
      expect(aiChatTabs(true)).toEqual([{ label: 'צ׳אט AI', value: AI_CHAT_TAB }]);
    });

    it('opens the existing chat page with a way back, keeping the current tab', async () => {
      component.selectedTab = 'billing';
      component.onTabChange(AI_CHAT_TAB);
      await router.navigate.calls.mostRecent().returnValue;
      await Promise.resolve();

      expect(router.navigate).toHaveBeenCalledOnceWith(['/' + DEV_AGENT_PATH], {
        queryParams: { from: 'admin-panel' },
      });
      expect(component.selectedTab).toBe('billing');
    });

    it('passes on a local ?api= backend override', () => {
      query = { api: 'http://localhost:3011' };
      component.onTabChange(AI_CHAT_TAB);

      expect(router.navigate).toHaveBeenCalledOnceWith(['/' + DEV_AGENT_PATH], {
        queryParams: { from: 'admin-panel', api: 'http://localhost:3011/' },
      });
    });

    it('drops a non-local ?api= value', () => {
      query = { api: 'https://evil.example.com/' };
      component.onTabChange(AI_CHAT_TAB);

      expect(router.navigate).toHaveBeenCalledOnceWith(['/' + DEV_AGENT_PATH], {
        queryParams: { from: 'admin-panel' },
      });
    });

    it('keeps other tabs as in-page panels', () => {
      component.onTabChange('documentation');
      expect(component.selectedTab).toBe('documentation');
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
