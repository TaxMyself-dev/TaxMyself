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

  it('does not register global dismissal listeners for a list of closed menus', async () => {
    await TestBed.configureTestingModule({ imports: [TableRowActionsMenuComponent] }).compileComponents();
    const listen = spyOn(document, 'addEventListener').and.callThrough();
    const fixtures = Array.from({ length: 40 }, () => {
      const fixture = TestBed.createComponent(TableRowActionsMenuComponent);
      fixture.componentRef.setInput('actions', [{ name: 'preview', icon: 'pi pi-eye', action: () => {} }]);
      fixture.detectChanges();
      return fixture;
    });
    const dismissalTypes = ['click', 'pointerdown', 'focusin', 'keydown'];
    const registrations = () => listen.calls.allArgs().filter(args => dismissalTypes.includes(args[0]));
    expect(registrations().length).toBe(0);
    (fixtures[0].nativeElement.querySelector('.actions-trigger') as HTMLButtonElement).click();
    expect(registrations().map(args => args[0])).toEqual(dismissalTypes);
    const remove = spyOn(document, 'removeEventListener').and.callThrough();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(fixtures[0].componentInstance.open()).toBeFalse();
    expect(remove.calls.allArgs().filter(args => dismissalTypes.includes(args[0])).length).toBe(4);
  });

  it('keeps inside interactions open and closes on outside focus, Escape, scroll and resize', async () => {
    await TestBed.configureTestingModule({ imports: [TableRowActionsMenuComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TableRowActionsMenuComponent);
    fixture.componentRef.setInput('actions', [{ name: 'preview', icon: 'pi pi-eye', action: () => {} }]);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.actions-trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(fixture.componentInstance.open()).toBeTrue();
    document.body.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(fixture.componentInstance.open()).toBeFalse();
    for (const [target, event] of [
      [document, new KeyboardEvent('keydown', { key: 'Escape' })],
      [window, new Event('resize')],
      [window, new Event('scroll')],
    ] as const) {
      trigger.click();
      expect(fixture.componentInstance.open()).toBeTrue();
      target.dispatchEvent(event);
      expect(fixture.componentInstance.open()).toBeFalse();
    }
  });

  it('removes open listeners on destruction', async () => {
    await TestBed.configureTestingModule({ imports: [TableRowActionsMenuComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TableRowActionsMenuComponent);
    fixture.componentRef.setInput('actions', [{ name: 'preview', icon: 'pi pi-eye', action: () => {} }]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.actions-trigger') as HTMLButtonElement).click();
    const close = spyOn(fixture.componentInstance, 'close').and.callThrough();
    fixture.destroy();
    document.body.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new Event('resize'));
    expect(close).not.toHaveBeenCalled();
  });

});
