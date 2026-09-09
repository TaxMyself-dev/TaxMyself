import { AdminContentComponent } from './admin-content.component';

describe('AdminContentComponent', () => {
  let component: AdminContentComponent;

  beforeEach(() => {
    component = new AdminContentComponent();
  });

  it('opens and closes the guide', () => {
    component.openGuide();
    expect(component.guideOpen).toBeTrue();
    component.closeGuide();
    expect(component.guideOpen).toBeFalse();
  });
});
