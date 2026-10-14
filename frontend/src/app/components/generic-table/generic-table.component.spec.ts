import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { GenericService } from 'src/app/services/generic.service';
import { IRowDataTable } from 'src/app/shared/interface';
import { TableRowActionsMenuComponent } from '../table-row-actions-menu/table-row-actions-menu.component';
import { GenericTableComponent } from './generic-table.component';
import { IGenericTableAction } from './table-actions';

describe('GenericTable unified row actions', () => {
  let fixture: ComponentFixture<GenericTableComponent<any, any>>;
  let component: GenericTableComponent<any, any>;
  const mobile = signal(false);
  const row: IRowDataTable = { id: 7, name: 'מסמך', sum: 100, date: '2026-10-14', file: 'stored.pdf' };
  let callback: jasmine.Spy;
  let action: IGenericTableAction;

  beforeEach(async () => {
    mobile.set(false);
    await TestBed.configureTestingModule({
      imports: [GenericTableComponent, NoopAnimationsModule],
      providers: [provideRouter([]), { provide: GenericService, useValue: { isMobile: () => mobile() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(GenericTableComponent);
    component = fixture.componentInstance;
    callback = jasmine.createSpy('action');
    action = { name: 'preview', icon: 'pi pi-eye', title: 'צפה', action: callback, fileRequirement: 'stored', desktopDisplay: 'icon' };
    fixture.componentRef.setInput('columnsTitle', [{ name: 'name', value: 'שם' }]);
    fixture.componentRef.setInput('dataTable', [row]);
    fixture.componentRef.setInput('actions', [action]);
    fixture.detectChanges();
  });

  function menu(): TableRowActionsMenuComponent {
    return fixture.debugElement.query(By.directive(TableRowActionsMenuComponent)).componentInstance;
  }

  it('renders the same filtered actions in desktop, mobile cards and mobile table rows', () => {
    fixture.componentRef.setInput('actions', [action, { ...action, name: 'hidden', showWhen: () => false }]);
    component.hoveredRowInfo.set({ row, top: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.floating-buttons app-p-button').length).toBe(1);
    mobile.set(true);
    fixture.detectChanges();
    expect(menu().actions().map(a => a.name)).toEqual(['preview']);
    expect(fixture.nativeElement.querySelector('.floating-buttons')).toBeNull();
    fixture.componentRef.setInput('mobileCardConfig', { primaryFields: ['name'], highlightedField: 'sum', dateField: 'date' });
    fixture.detectChanges();
    expect(menu().actions().map(a => a.name)).toEqual(['preview']);
  });

  for (const cards of [false, true]) {
    it('executes a mobile ' + (cards ? 'card' : 'table') + ' action on its explicit row without hover', () => {
      mobile.set(true);
      if (cards) fixture.componentRef.setInput('mobileCardConfig', { primaryFields: ['name'], highlightedField: 'sum', dateField: 'date' });
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.actions-trigger') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.action-item') as HTMLButtonElement).click();
      expect(callback).toHaveBeenCalledOnceWith(null, row);
      expect(component.hoveredRowInfo()).toBeNull();
    });
  }

  it('hides the mobile trigger when all actions are unavailable', () => {
    mobile.set(true);
    fixture.componentRef.setInput('actions', [{ ...action, showWhen: () => false }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.actions-trigger')).toBeNull();
  });

  it('exposes an opt-in attachment fallback on mobile even with no configured actions', () => {
    mobile.set(true);
    fixture.componentRef.setInput('actions', []);
    fixture.componentRef.setInput('dataTable', [{ id: 8 }]);
    fixture.componentRef.setInput('fileAttachmentEnabled', true);
    fixture.detectChanges();
    expect(menu().actions().map(a => a.name)).toEqual(['__attach-file']);
    expect(fixture.nativeElement.querySelector('.actions-trigger')).not.toBeNull();
  });

  it('rechecks visibility and loading before execution', () => {
    fixture.componentRef.setInput('actions', [{ ...action, showWhen: () => false }]);
    component.executeAction(action, row);
    expect(callback).not.toHaveBeenCalled();
    const loading = { ...action, isLoading: () => true };
    fixture.componentRef.setInput('actions', [loading]);
    component.executeAction(loading, row);
    expect(callback).not.toHaveBeenCalled();
  });

  it('never provides a file input to an ordinary edit action', () => {
    const edit = { ...action, name: 'edit' };
    fixture.componentRef.setInput('actions', [edit]);
    component.executeAction(edit, row);
    expect(callback).toHaveBeenCalledOnceWith(null, row);
  });

  it('keeps a stable file input and gives replacement the selected row', () => {
    const replace = { ...action, name: 'edit', execution: 'fileInput' as const };
    fixture.componentRef.setInput('actions', [replace]);
    mobile.set(true);
    fixture.detectChanges();
    const input = component.fileInput.nativeElement;
    component.executeAction(replace, row);
    expect(callback).toHaveBeenCalledOnceWith(input, row);
    component.hoveredRowInfo.set({ row: { id: 99 }, top: 0 });
    fixture.detectChanges();
    expect(component.fileInput.nativeElement).toBe(input);
  });

  function selectFile(input: HTMLInputElement, file?: File): void {
    const transfer = new DataTransfer();
    if (file) transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  }

  it('emits one attachment event for the selected row even if hover changes', () => {
    const target = { id: 8 };
    const file = new File(['pdf'], 'receipt.pdf', { type: 'application/pdf' });
    fixture.componentRef.setInput('fileAttachmentEnabled', true);
    fixture.detectChanges();
    const input = component.fileInput.nativeElement;
    spyOn(input, 'click');
    const emit = spyOn(component.fileChange, 'emit');
    component.triggerFileInput(target);
    component.hoveredRowInfo.set({ row, top: 0 });
    selectFile(input, file);
    expect(emit).toHaveBeenCalledOnceWith({ row: target, file });
    selectFile(input, file);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('leaves replacement files for the parent listener without emitting an attachment', () => {
    const file = new File(['pdf'], 'replacement.pdf');
    let selected: File | undefined;
    const replace: IGenericTableAction = { ...action, execution: 'fileInput', action: input => {
      input.addEventListener('change', () => selected = input.files[0], { once: true });
    } };
    fixture.componentRef.setInput('actions', [replace]);
    fixture.detectChanges();
    const emit = spyOn(component.fileChange, 'emit');
    component.executeAction(replace, row);
    selectFile(component.fileInput.nativeElement, file);
    expect(selected).toBe(file);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not upload when a file selection is canceled', () => {
    fixture.componentRef.setInput('fileAttachmentEnabled', true);
    fixture.detectChanges();
    spyOn(component.fileInput.nativeElement, 'click');
    const emit = spyOn(component.fileChange, 'emit');
    component.triggerFileInput({ id: 8 });
    selectFile(component.fileInput.nativeElement);
    expect(emit).not.toHaveBeenCalled();
  });

  it('clears the attachment target on a native picker cancel event', () => {
    fixture.componentRef.setInput('fileAttachmentEnabled', true);
    fixture.detectChanges();
    const input = component.fileInput.nativeElement;
    spyOn(input, 'click');
    const emit = spyOn(component.fileChange, 'emit');
    component.triggerFileInput({ id: 8 });
    input.dispatchEvent(new Event('cancel'));
    selectFile(input, new File(['pdf'], 'ignored.pdf'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('uses the current callback when an action definition is refreshed', () => {
    const nextCallback = jasmine.createSpy('updated action');
    fixture.componentRef.setInput('actions', [{ ...action, action: nextCallback }]);
    component.executeAction(action, row);
    expect(callback).not.toHaveBeenCalled();
    expect(nextCallback).toHaveBeenCalledOnceWith(null, row);
  });

  it('does not create a picker or attachment action when file editing is disabled', () => {
    fixture.componentRef.setInput('fileAttachmentEnabled', true);
    fixture.componentRef.setInput('fileEditingEnabled', false);
    fixture.detectChanges();
    expect(component.fileInput).toBeUndefined();
    expect(component.getActionsForRow({ id: 8 })).toEqual([]);
    expect(component.getActionsForRow(row).map(a => a.name)).toEqual(['preview']);
  });

  it('treats a Drive link as stored even without a Firebase path', () => {
    expect(component.hasStoredFile({ id: 7, sourceDocumentId: 42 })).toBeTrue();
    expect(component.showAttachButton({ id: 7, sourceDocumentId: 42 })).toBeFalse();
    expect(component.getActionsForRow({ id: 7, sourceDocumentId: 42 }).map(a => a.name)).toEqual(['preview']);
  });
});
