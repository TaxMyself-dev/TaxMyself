import { TestBed } from '@angular/core/testing';
import { TableRowActionsMenuComponent } from './table-row-actions-menu.component';

describe('Mobile row-action menu', () => {
  it('shows loading, blocks the busy action, closes on selection and outside click', async () => {
    await TestBed.configureTestingModule({ imports: [TableRowActionsMenuComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TableRowActionsMenuComponent);
    const busy = { name: 'busy', icon: 'pi pi-eye', action: () => {}, isLoading: () => true };
    const ready = { name: 'ready', icon: 'pi pi-eye', action: () => {} };
    fixture.componentRef.setInput('actions', [busy, ready]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.actions-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.action-item');
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[0].querySelector('.pi-spinner')).not.toBeNull();
    const emit = spyOn(fixture.componentInstance.actionClicked, 'emit');
    fixture.componentInstance.select(busy, new Event('click'));
    expect(emit).not.toHaveBeenCalled();
    buttons[1].click();
    expect(emit).toHaveBeenCalledOnceWith(ready);
    expect(fixture.componentInstance.open()).toBeFalse();
    (fixture.nativeElement.querySelector('.actions-trigger') as HTMLButtonElement).click();
    document.body.click();
    expect(fixture.componentInstance.open()).toBeFalse();
  });
});
