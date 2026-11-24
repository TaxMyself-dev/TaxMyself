import { FormBuilder } from '@angular/forms';
import { AdminPanelPage } from './admin-panel.page';
describe('AdminPanelPage',()=>{
  const page=()=>new AdminPanelPage(new FormBuilder(),{} as any,{} as any,{} as any);
  it('retains administrative tools',()=>{
    const component=page();
    expect(component.tabs.map(tab=>tab.value)).toContain('catalog-management');
    expect(component.tabs.map(tab=>tab.value)).toContain('tax-file');
    expect(component.tabs.map(tab=>tab.value)).toContain('content');
    expect(component.catalogTabs.map(tab=>tab.value)).toEqual(['categories','cards']);
  });
  it('includes Feezback in the existing admin panel',()=>{
    const component=page();expect(component.tabs.map(tab=>tab.value)).toContain('feezback');
    component.onTabChange('feezback');expect(component.selectedTab).toBe('feezback');
  });
  it('moves AI chat and onboarding out of the admin panel',()=>{
    expect(page().tabs.map(tab=>tab.value)).not.toContain('ai-chat');
    expect(page().tabs.map(tab=>tab.value)).not.toContain('agent-onboarding');
  });
  it('switches existing panels and nested catalogs',()=>{
    const component=page();component.onTabChange('billing');expect(component.selectedTab).toBe('billing');
    component.onCatalogTabChange('cards');expect(component.selectedCatalogTab).toBe('cards');
    component.onCatalogTabChange('unknown');expect(component.selectedCatalogTab).toBe('categories');
  });
});
