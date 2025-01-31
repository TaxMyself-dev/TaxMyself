import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { ClientPanelPage } from './clients-panel.page';

describe('ClientPanelPage', () => {
  let component: ClientPanelPage;
  let fixture: ComponentFixture<ClientPanelPage>;

  beforeEach(async(() => {
    fixture = TestBed.createComponent(ClientPanelPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
