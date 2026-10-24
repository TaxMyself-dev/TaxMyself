import { signal } from '@angular/core';
import { SettingsPage } from './settings.page';
import { IRowDataTable } from 'src/app/shared/interface';

// Same provider identifier can belong to both people: only the database source
// record identifies the selected row safely.
describe('settings banking row action routing', () => {
  function setup() {
    const page = Object.create(SettingsPage.prototype) as SettingsPage;
    page.accountSourcesLoading = signal(false);
    page.retryingSourceId = signal<string | null>(null);
    page.deletingSourceId = signal<number | null>(null);
    page.authService = { isViewingAsClient: () => false } as any;
    page.accountSources = signal<any[]>([
      { sourceRecordId: 21, sourceName: '1234', connectionRole: 'primary', hasConsent: true },
      { sourceRecordId: 22, sourceName: '1234', connectionRole: 'spouse', hasConsent: true },
      { sourceRecordId: 23, sourceName: '5678', hasConsent: false },
    ]);
    page.bankingManagement = {
      canManage: () => true, synthetic: signal(false), loading: signal(false), busy: signal(false),
      openSourceConsent: jasmine.createSpy('preview'), reconnect: jasmine.createSpy('reconnect'),
    } as any;
    return page;
  }
  const row = (sourceRecordId: number) => ({ id: String(sourceRecordId), sourceRecordId }) as IRowDataTable;

  it('previews only the selected stable source record despite matching account numbers', () => {
    const page = setup();
    page.openSourceConsent(row(22));
    expect(page.bankingManagement!.openSourceConsent).toHaveBeenCalledOnceWith(22);
    expect(page.bankingManagement!.reconnect).not.toHaveBeenCalled();
  });

  it('ignores stale and disconnected rows rather than previewing another source', () => {
    const page = setup();
    page.openSourceConsent(row(999));
    page.openSourceConsent(row(23));
    expect(page.bankingManagement!.openSourceConsent).not.toHaveBeenCalled();
  });

  it('reconnects only a disconnected source still present in the table', () => {
    const page = setup();
    page.reconnectSource(row(21));
    page.reconnectSource(row(999));
    expect(page.bankingManagement!.reconnect).not.toHaveBeenCalled();
    page.reconnectSource(row(23));
    expect(page.bankingManagement!.reconnect).toHaveBeenCalledTimes(1);
  });

  it('rejects owner actions in represented-client mode even through direct callbacks', () => {
    const page = setup();
    page.authService = { isViewingAsClient: () => true } as any;
    page.openSourceConsent(row(21));
    page.reconnectSource(row(23));
    expect(page.bankingManagement!.openSourceConsent).not.toHaveBeenCalled();
    expect(page.bankingManagement!.reconnect).not.toHaveBeenCalled();
  });

  for (const operation of ['discovery', 'disconnect', 'pull', 'delete', 'source-load'] as const) {
    it('blocks consent actions during ' + operation, () => {
      const page = setup();
      if (operation === 'discovery') (page.bankingManagement!.loading as any).set(true);
      if (operation === 'disconnect') (page.bankingManagement!.busy as any).set(true);
      if (operation === 'pull') page.retryingSourceId.set('21');
      if (operation === 'delete') page.deletingSourceId.set(21);
      if (operation === 'source-load') page.accountSourcesLoading.set(true);
      page.openSourceConsent(row(21));
      page.reconnectSource(row(23));
      expect(page.bankingManagement!.openSourceConsent).not.toHaveBeenCalled();
      expect(page.bankingManagement!.reconnect).not.toHaveBeenCalled();
    });
  }

  it('does not start real consent actions for demonstration banking', () => {
    const page = setup();
    (page.bankingManagement!.synthetic as any).set(true);
    page.openSourceConsent(row(21));
    page.reconnectSource(row(23));
    expect(page.bankingManagement!.openSourceConsent).not.toHaveBeenCalled();
    expect(page.bankingManagement!.reconnect).not.toHaveBeenCalled();
  });
});
