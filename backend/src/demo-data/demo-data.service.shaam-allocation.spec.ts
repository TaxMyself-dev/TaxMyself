import { DocumentType } from 'src/enum';
import { DemoDataService } from './demo-data.service';
import { DEMO_PROFILES, isDemoEmail } from './profiles';
import {
  SHAAM_ALLOCATION_BUSINESS_NUMBER,
  SHAAM_ALLOCATION_CUSTOMER_NUMBER,
  SHAAM_ALLOCATION_TEST_PROFILE,
} from './profiles/shaam-allocation-test.profile';

function createHarness() {
  const service: any = Object.create(DemoDataService.prototype);
  service.documentsService = {
    createDoc: jest.fn(),
    saveDraft: jest.fn().mockResolvedValue({}),
  };
  service.expensesService = { addExpense: jest.fn() };
  service.warnIfChartOfAccountsMissing = jest.fn().mockResolvedValue(undefined);
  service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return service;
}

describe('SHAAM allocation demo profile', () => {
  it('is registered as a demo user with the documented sandbox issuer', () => {
    expect(DEMO_PROFILES).toContain(SHAAM_ALLOCATION_TEST_PROFILE);
    expect(isDemoEmail(SHAAM_ALLOCATION_TEST_PROFILE.email)).toBe(true);
    expect(SHAAM_ALLOCATION_TEST_PROFILE.businesses).toEqual([
      expect.objectContaining({
        businessNumber: SHAAM_ALLOCATION_BUSINESS_NUMBER,
      }),
    ]);
  });

  it('declares one current-date tax-invoice draft above the allocation threshold', () => {
    expect(SHAAM_ALLOCATION_TEST_PROFILE.documents).toEqual([
      expect.objectContaining({
        businessNumberRef: SHAAM_ALLOCATION_BUSINESS_NUMBER,
        docType: DocumentType.TAX_INVOICE,
        recipientId: SHAAM_ALLOCATION_CUSTOMER_NUMBER,
        sumAftDisBefVAT: 6000,
        vatSum: 1080,
        useCurrentDate: true,
        isDraft: true,
      }),
    ]);
  });

  it('saves the allocation fixture as a restorable draft without issuing it', async () => {
    const service = createHarness();

    await service.seedDocumentsAndExpenses(
      'shaam-demo-firebase-id',
      SHAAM_ALLOCATION_TEST_PROFILE,
    );

    expect(service.documentsService.createDoc).not.toHaveBeenCalled();
    expect(service.documentsService.saveDraft).toHaveBeenCalledTimes(1);
    const [firebaseId, payload] = service.documentsService.saveDraft.mock.calls[0];
    expect(firebaseId).toBe('shaam-demo-firebase-id');
    expect(payload.docData).toEqual(expect.objectContaining({
      issuerBusinessNumber: SHAAM_ALLOCATION_BUSINESS_NUMBER,
      recipientId: SHAAM_ALLOCATION_CUSTOMER_NUMBER,
      docNumber: '',
      sumAftDisBefVAT: 6000,
      vatSum: 1080,
      sumAftDisWithVAT: 7080,
    }));
    expect(payload.docData.docDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.docData.valueDate).toBe(payload.docData.docDate);
    expect(payload.linesData).toEqual([
      expect.objectContaining({
        description: 'שירותי ייעוץ - בדיקת מספר הקצאה',
        sumAftDisBefVatPerLine: 6000,
        vatPerLine: 1080,
      }),
    ]);
  });

  it('fails the strict demo fixture when its required draft cannot be saved', async () => {
    const service = createHarness();
    service.documentsService.saveDraft.mockRejectedValueOnce(new Error('draft failed'));

    await expect(service.seedDocumentsAndExpenses(
      'shaam-demo-firebase-id',
      SHAAM_ALLOCATION_TEST_PROFILE,
    )).rejects.toThrow('draft failed');
  });
});
