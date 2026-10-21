import { of, throwError } from 'rxjs';
import { CardcomService } from './cardcom.service';

describe('CardCom refund boundary', () => {
  function adapter(post: jest.Mock) {
    const service = new CardcomService({ post } as any);
    Object.assign(service, { apiName: 'mock-api', apiPassword: 'mock-secret' });
    return service;
  }
  it('uses the official refund schema and converts agorot; does not send charge idempotency fields', async () => {
    const post = jest.fn().mockReturnValue(of({ data: { ResponseCode: 0, NewTranzactionId: 22 } }));
    await adapter(post).refundTransaction({ transactionId: '11', amountAgorot: 1180, requestId: 'refund-id' });
    expect(post).toHaveBeenCalledWith('https://secure.cardcom.solutions/api/v11/Transactions/RefundByTransactionId', {
      ApiName: 'mock-api', ApiPassword: 'mock-secret', TransactionId: 11, PartialSum: 11.8,
      AllowMultipleRefunds: true, CancelOnly: false, ExternalRefundDealId: 'refund-id',
    }, { timeout: 30000, maxRedirects: 0 });
  });
  it('makes only one request after timeout and strips axios payload/credentials from its error', async () => {
    const post = jest.fn().mockReturnValue(throwError(() => Error('mock-secret')));
    await expect(adapter(post).refundTransaction({ transactionId: '11', amountAgorot: 100, requestId: 'id' })).rejects.toThrow('Refund result is unknown');
    expect(post).toHaveBeenCalledTimes(1);
  });
});
