import { IncomesPage } from './incomes.page';

describe('pending allocation confirmation', () => {
  function setup() {
    const page = Object.create(IncomesPage.prototype) as IncomesPage;
    (page as any).confirmationService = { confirm: jasmine.createSpy('confirm') };
    (page as any).messageService = { add: jasmine.createSpy('add') };
    (page as any).resumeAutomaticAllocation = jasmine.createSpy('resumeAutomaticAllocation');
    return page;
  }

  it('does not contact SHAAM until the user confirms the document number', () => {
    const page = setup();
    const row = { docNumber: '30199' } as any;

    (page as any).confirmResumeAutomaticAllocation(row);

    expect((page as any).resumeAutomaticAllocation).not.toHaveBeenCalled();
    const dialog = (page as any).confirmationService.confirm.calls.mostRecent().args[0];
    expect(dialog.message).toContain('30199');
    expect(dialog.rejectLabel).toBe('ביטול');
    expect(dialog.rejectVisible).toBeTrue();

    dialog.accept();
    expect((page as any).resumeAutomaticAllocation).toHaveBeenCalledOnceWith(row);
  });

  it('does not open a confirmation or request allocation without a document number', () => {
    const page = setup();

    (page as any).confirmResumeAutomaticAllocation({});

    expect((page as any).confirmationService.confirm).not.toHaveBeenCalled();
    expect((page as any).resumeAutomaticAllocation).not.toHaveBeenCalled();
    expect((page as any).messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'error' }),
    );
  });
});
