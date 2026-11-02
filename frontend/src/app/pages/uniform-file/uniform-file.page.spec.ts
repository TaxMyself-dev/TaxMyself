import { signal } from '@angular/core';
import { of } from 'rxjs';
import { UniformFilePage } from './uniform-file.page';

describe('UniformFilePage SHAAM flow', () => {
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
    (page as any).messageService = { add: jasmine.createSpy('add') };
    (page as any).shaamService = {
      initiateOAuthFlow: jasmine.createSpy('initiateOAuthFlow'),
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
});
