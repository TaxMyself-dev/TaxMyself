import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { SettingsPage } from './settings.page';

describe('settings payment source deletion', () => {
  function setup() {
    const page = Object.create(SettingsPage.prototype) as SettingsPage;
    page.deletingSourceId = signal<number | null>(null);
    page.accountSources = signal<any[]>([{ sourceRecordId: 22 }, { sourceRecordId: 23 }]);
    page.confirmationService = { confirm: jasmine.createSpy('confirm') } as any;
    page.transactionsService = { deleteSource: jasmine.createSpy('deleteSource').and.returnValue(of({ deleted: true })) } as any;
    page.messageService = { add: jasmine.createSpy('add') } as any;
    (page as any).fetchAccountSources = jasmine.createSpy('refresh');
    return page;
  }
  it('explains active consent without submitting deletion', () => {
    const page = setup();
    page.onDeleteSource({ sourceRecordId: 22, sourceName: '1234', hasConsent: true });
    const dialog = (page.confirmationService.confirm as jasmine.Spy).calls.mostRecent().args[0];
    expect(dialog.message).toContain('1234');
    expect(dialog.message).toContain('לא ניתן להסיר');
    expect(dialog.message).not.toContain('פיזבק');
    expect(dialog.key).toBe('payment-source');
    expect(dialog.message).toContain('הרשאה חדשה'); expect(dialog.rejectVisible).toBeFalse();
    expect(page.transactionsService.deleteSource).not.toHaveBeenCalled();
  });
  it('requires confirmation then removes only the chosen record', () => {
    const page = setup();
    page.onDeleteSource({ sourceRecordId: 22, sourceName: '1234', hasConsent: false });
    expect(page.transactionsService.deleteSource).not.toHaveBeenCalled();
    (page.confirmationService.confirm as jasmine.Spy).calls.mostRecent().args[0].accept();
    expect(page.transactionsService.deleteSource).toHaveBeenCalledWith(22);
    expect(page.accountSources().map(s => s.sourceRecordId)).toEqual([23]);
    expect(page.deletingSourceId()).toBeNull();
  });
  it('refreshes and explains when consent changed after loading the page', () => {
    const page = setup();
    (page.transactionsService.deleteSource as jasmine.Spy).and.returnValue(throwError(() => ({ error: { code: 'SOURCE_HAS_ACTIVE_CONSENT' } })));
    page.onDeleteSource({ sourceRecordId: 22, sourceName: '1234', hasConsent: false });
    (page.confirmationService.confirm as jasmine.Spy).calls.mostRecent().args[0].accept();
    expect((page as any).fetchAccountSources).toHaveBeenCalled();
    expect(page.accountSources().length).toBe(2); expect(page.deletingSourceId()).toBeNull();
    expect((page.confirmationService.confirm as jasmine.Spy).calls.mostRecent().args[0].rejectVisible).toBeFalse();
  });
  it('retains the row and clears loading after a failed deletion', () => {
    const page = setup();
    (page.transactionsService.deleteSource as jasmine.Spy).and.returnValue(throwError(() => ({ status: 500 })));
    page.onDeleteSource({ sourceRecordId: 22, sourceName: '1234', hasConsent: false });
    (page.confirmationService.confirm as jasmine.Spy).calls.mostRecent().args[0].accept();
    expect(page.accountSources().length).toBe(2); expect(page.deletingSourceId()).toBeNull();
    expect(page.messageService.add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error' }));
  });
});
