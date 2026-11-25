import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { BusinessStatus, ReportingPeriodType } from 'src/app/shared/enums';
import { UNIFORM_FILE_OAUTH_SELECTION_KEY, UniformFilePage } from './uniform-file.page';

describe('UniformFilePage SHAAM flow', () => {
  beforeEach(() => sessionStorage.removeItem(UNIFORM_FILE_OAUTH_SELECTION_KEY));
  afterEach(() => sessionStorage.removeItem(UNIFORM_FILE_OAUTH_SELECTION_KEY));

  function setup() {
    const page = Object.create(UniformFilePage.prototype) as UniformFilePage;
    page.businessNumber = signal('777777745');
    page.startDate = '2025-01-01';
    page.endDate = '2025-12-31';
    page.reportDetails = {
      businessNumber: '777777745',
      businessName: 'Sandbox',
      startDate: page.startDate,
      endDate: page.endDate,
      downloadLink: 'OPENFRMT/path',
    };
    page.uniformConnectionStatus = 'connected';
    page.uniformSubmission = null;
    page.isSubmittingToShaam = false;
    page.isPollingShaam = false;
    page.userData = { firebaseId: 'test-owner', businessStatus: BusinessStatus.MULTI_BUSINESS } as any;
    (page as any).authService = { getUserDataFromLocalStorage: () => page.userData };
    (page as any).gs = {
      businesses: signal([
        { businessNumber: '111111118', businessName: 'First business' },
        { businessNumber: '777777745', businessName: 'Sandbox' },
      ]),
      businessSelectItems: signal([]),
    };
    (page as any).dateService = {
      getStartAndEndDates: (_mode: unknown, _year: unknown, _month: unknown, startDate: string, endDate: string) => ({ startDate, endDate }),
      toIsoDate: (date: string) => date,
    };
    (page as any).fileService = {
      createUniformFile: jasmine.createSpy('createUniformFile').and.returnValue(of({
        document_summary: [], list_summary: [], filePath: 'restored/path', file: 'zip-data',
      })),
    };
    (page as any).messageService = { add: jasmine.createSpy('add') };
    (page as any).shaamService = {
      initiateOAuthFlow: jasmine.createSpy('initiateOAuthFlow'),
      getConnectionStatus: jasmine.createSpy('getConnectionStatus').and.returnValue(of({ connected: true })),
      createUniformFileSubmission: jasmine
        .createSpy('createUniformFileSubmission')
        .and.returnValue(
          of({
            id: 4,
            state: 'PROCESSING',
            periodStart: page.startDate,
            periodEnd: page.endDate,
            iniStatus: 'APPROVED',
            bkmStatus: 'UPLOADED',
            errorCategory: null,
            errorCode: null,
            errorMessage: null,
            generatedAt: new Date().toISOString(),
            uploadedAt: new Date().toISOString(),
            lastPolledAt: new Date().toISOString(),
            completedAt: null,
          }),
        ),
    };
    return page;
  }

  it('starts the dedicated uniform-file Daily Token flow', () => {
    const page = setup();

    page.connectUniformFile();

    expect((page as any).shaamService.initiateOAuthFlow).toHaveBeenCalledWith(
      '777777745',
      jasmine.any(Function),
      'uniform-file',
      'UNIFORM_FILE',
    );
  });

  it('submits only the selected business and generated period', () => {
    const page = setup();

    page.submitUniformFileToShaam();

    expect(
      (page as any).shaamService.createUniformFileSubmission,
    ).toHaveBeenCalledWith('777777745', '2025-01-01', '2025-12-31');
    expect(page.uniformSubmission?.state).toBe('PROCESSING');
  });

  it('never presents Uploaded as Approved', () => {
    const page = setup();

    expect(page.fileStatusLabel('UPLOADED')).toBe('הועלה וממתין לעיבוד');
    expect(page.fileStatusLabel('UPLOADED')).not.toBe('אושר');
    expect(page.submissionStateLabel('PROCESSING')).toContain('ממתין');
  });

  it('restores the generated business and dates after a full OAuth page reload without downloading or submitting', async () => {
    const beforeRedirect = setup();
    beforeRedirect.connectUniformFile();
    expect(JSON.parse(sessionStorage.getItem(UNIFORM_FILE_OAUTH_SELECTION_KEY)!)).toEqual({
      userFirebaseId: 'test-owner', businessNumber: '777777745',
      startDate: '2025-01-01', endDate: '2025-12-31',
    });

    const returned = setup();
    const download = spyOn<any>(returned, 'downloadBase64Zip');
    returned.ngOnInit();
    await Promise.resolve();

    expect(returned.businessNumber()).toBe('777777745');
    expect(returned.filterConfig[0].defaultValue).toBe('777777745');
    expect(returned.filterConfig[1].periodDefaults).toEqual(jasmine.objectContaining({
      periodMode: ReportingPeriodType.DATE_RANGE,
      startDate: '2025-01-01', endDate: '2025-12-31',
    }));
    expect((returned as any).fileService.createUniformFile).toHaveBeenCalledOnceWith(
      '2025-01-01', '2025-12-31', '777777745',
    );
    expect(returned.reportDetails?.downloadLink).toBe('restored/path');
    expect((returned as any).shaamService.getConnectionStatus).toHaveBeenCalledWith('777777745', 'UNIFORM_FILE');
    expect(download).not.toHaveBeenCalled();
    expect((returned as any).shaamService.createUniformFileSubmission).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(UNIFORM_FILE_OAUTH_SELECTION_KEY)).toBeNull();
  });

  it('keeps filters but offers no generated report if restoration fails', async () => {
    const page = setup();
    page.connectUniformFile();
    (page as any).fileService.createUniformFile.and.returnValue(throwError(() => new Error('Generation failed')));
    page.ngOnInit();
    await Promise.resolve();
    expect(page.filterConfig[0].defaultValue).toBe('777777745');
    expect(page.filterConfig[1].periodDefaults?.startDate).toBe('2025-01-01');
    expect(page.reportDetails).toBeNull();
    expect((page as any).messageService.add).toHaveBeenCalled();
    expect((page as any).shaamService.createUniformFileSubmission).not.toHaveBeenCalled();
  });

  for (const invalid of [
    '{invalid json',
    JSON.stringify({ userFirebaseId: 'another-user', businessNumber: '777777745', startDate: '2025-01-01', endDate: '2025-12-31' }),
    JSON.stringify({ userFirebaseId: 'test-owner', businessNumber: 'removed-business', startDate: '2025-01-01', endDate: '2025-12-31' }),
    JSON.stringify({ userFirebaseId: 'test-owner', businessNumber: '777777745', startDate: '2025-02-30', endDate: '2025-12-31' }),
    JSON.stringify({ userFirebaseId: 'test-owner', businessNumber: '777777745', startDate: '2025-12-31', endDate: '2025-01-01' }),
  ]) {
    it(`discards invalid or inaccessible stored selection: ${invalid}`, () => {
      const page = setup();
      sessionStorage.setItem(UNIFORM_FILE_OAUTH_SELECTION_KEY, invalid);
      page.ngOnInit();
      expect(page.businessNumber()).toBe('111111118');
      expect(page.filterConfig[1].periodDefaults?.startDate).toBeUndefined();
      expect((page as any).fileService.createUniformFile).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(UNIFORM_FILE_OAUTH_SELECTION_KEY)).toBeNull();
    });
  }

  it('clears the return selection if OAuth initiation fails', () => {
    const page = setup();
    (page as any).shaamService.initiateOAuthFlow.and.callFake((_business: string, onError: () => void) => onError());
    page.connectUniformFile();
    expect(sessionStorage.getItem(UNIFORM_FILE_OAUTH_SELECTION_KEY)).toBeNull();
    expect((page as any).messageService.add).toHaveBeenCalled();
  });

  it('still downloads ZIP on an explicit report request', async () => {
    const page = setup();
    const download = spyOn<any>(page, 'downloadBase64Zip');
    await page.onSubmit({ businessNumber: '777777745', periodMode: ReportingPeriodType.DATE_RANGE,
      startDate: '2025-01-01', endDate: '2025-12-31' });
    expect(download).toHaveBeenCalledOnceWith('zip-data');
  });
});
