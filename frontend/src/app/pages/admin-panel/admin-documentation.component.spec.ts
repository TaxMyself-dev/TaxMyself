import { AdminDocumentationComponent } from './admin-documentation.component';

describe('AdminDocumentationComponent', () => {
  let component: AdminDocumentationComponent;

  beforeEach(() => {
    component = new AdminDocumentationComponent();
  });

  it('exposes the three primary product modules and their topics', () => {
    expect(component.modules.map((module) => module.id)).toEqual([
      'accounting',
      'open-banking',
      'billing',
    ]);
    expect(component.modules.every((module) => module.topics.length >= 4)).toBeTrue();
  });

  it('moves to the first topic when a module is selected', () => {
    component.selectModule(component.modules[1]);

    expect(component.activeModule.id).toBe('open-banking');
    expect(component.activeTopic.id).toBe('banking-overview');
  });

  it('searches across module, topic, behavior and notes content', () => {
    component.searchTerm = 'webhook';

    expect(component.searchResults.length).toBeGreaterThan(0);
    expect(component.searchResults.some((result) => result.module.id === 'billing')).toBeTrue();
    expect(component.searchResults.some((result) => result.module.id === 'open-banking')).toBeTrue();
  });

  it('opens a search result and clears the query', () => {
    component.searchTerm = 'כרטיס דביט';
    const result = component.searchResults[0];

    component.openSearchResult(result);

    expect(component.activeModuleId).toBe(result.module.id);
    expect(component.activeTopicId).toBe(result.topic.id);
    expect(component.searchTerm).toBe('');
  });
});
