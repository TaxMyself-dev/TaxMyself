import { FormBuilder } from '@angular/forms';
import { AdminPanelPage } from './admin-panel.page';

describe('AdminPanelPage', () => {
  let component: AdminPanelPage;

  beforeEach(() => {
    component = new AdminPanelPage(new FormBuilder(), {} as any, {} as any);
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

  it('switches between the nested catalog tabs', () => {
    component.onCatalogTabChange('cards');
    expect(component.selectedCatalogTab).toBe('cards');

    component.onCatalogTabChange('unexpected');
    expect(component.selectedCatalogTab).toBe('categories');
  });
});
