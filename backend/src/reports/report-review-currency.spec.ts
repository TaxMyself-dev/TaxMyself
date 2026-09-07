import { ExtractedDocStatus } from '../documents/extracted-document.entity';
import { ReportReviewService } from './report-review.service';

describe('ReportReviewService pending-document currency edits', () => {
  const makeService = () => {
    const service: any = Object.create(ReportReviewService.prototype);
    service.fxRateService = { getRate: jest.fn().mockResolvedValue(3.25) };
    return service;
  };

  it('quotes a changed foreign amount in ILS using the document date rate', async () => {
    const service = makeService();

    await expect(service.quoteFxAmount(10, 'usd', new Date('2026-03-31')))
      .resolves.toEqual({
        amount: 10,
        currency: 'USD',
        ilsAmount: 32.5,
        fxRateToIls: 3.25,
      });
    expect(service.fxRateService.getRate).toHaveBeenCalledWith(
      new Date('2026-03-31'),
      'USD',
    );
  });

  it('uses the edited source amount and currency when building approval input', () => {
    const service = makeService();
    const result = service.buildExpenseAmountFromDoc(
      { amount: '16.8', currency: 'USD' },
      { amount: 10, currency: 'EUR' },
    );

    expect(result).toEqual({ sum: 10, originalCurrency: 'EUR', originalSum: 10 });
  });

  it('recomputes and persists derived FX fields when a pending amount changes', async () => {
    const service = makeService();
    const doc = {
      id: 7,
      status: ExtractedDocStatus.PENDING_REVIEW,
      deletedAt: null,
      amount: '16.8',
      currency: 'USD',
      date: '2026-03-31',
      ilsAmount: '50.48',
      fxRateToIls: '3.004762',
    };
    service.docRepo = {
      findOne: jest.fn().mockResolvedValue(doc),
      update: jest.fn().mockResolvedValue(undefined),
    };
    service.assertDocOwnership = jest.fn().mockResolvedValue(undefined);

    const result = await service.updateDocFields('uid', '123', 7, { amount: 10 });

    expect(service.docRepo.update).toHaveBeenCalledWith(
      { id: 7 },
      expect.objectContaining({
        amount: 10,
        currency: 'USD',
        ilsAmount: '32.5',
        fxRateToIls: '3.25',
      }),
    );
    expect(result).toEqual({
      ok: true,
      amount: 10,
      currency: 'USD',
      ilsAmount: 32.5,
      fxRateToIls: 3.25,
    });
  });

  it('clears derived FX fields when changing the document back to ILS', async () => {
    const service = makeService();
    const doc = {
      id: 8,
      status: ExtractedDocStatus.PENDING_REVIEW,
      deletedAt: null,
      amount: '16.8',
      currency: 'USD',
      date: '2026-03-31',
      ilsAmount: '50.48',
      fxRateToIls: '3.004762',
    };
    service.docRepo = {
      findOne: jest.fn().mockResolvedValue(doc),
      update: jest.fn().mockResolvedValue(undefined),
    };
    service.assertDocOwnership = jest.fn().mockResolvedValue(undefined);

    const result = await service.updateDocFields('uid', '123', 8, {
      amount: 10,
      currency: 'ILS',
    });

    expect(service.fxRateService.getRate).not.toHaveBeenCalled();
    expect(service.docRepo.update).toHaveBeenCalledWith(
      { id: 8 },
      expect.objectContaining({ currency: 'ILS', ilsAmount: null, fxRateToIls: null }),
    );
    expect(result.ilsAmount).toBeNull();
    expect(result.fxRateToIls).toBeNull();
  });
});
