import { of, throwError } from 'rxjs';
import { CardcomService } from './cardcom.service';
import { sanitizeCardcomDescription } from '../utils/cardcom-description';

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
  it('preserves a bounded, redacted provider error description, including HTTP error bodies', async () => {
    const post = jest.fn().mockReturnValue(throwError(() => ({ response: { data: {
      ResponseCode: 671, Description: 'API mock-api password=mock-secret CardNumber=4580000000000000 cannot refund',
    } } })));
    const result = await adapter(post).refundTransaction({ transactionId: '11', amountAgorot: 100, requestId: 'id' });
    expect(result.ResponseCode).toBe(671); expect(result.Description).toContain('cannot refund');
    expect(result.Description).not.toMatch(/mock-api|mock-secret|4580000000000000/);
    expect(sanitizeCardcomDescription('x'.repeat(900))?.length).toBe(500);
  });
  it('uses only the read-only list endpoint and strips tokens/PII from evidence rows', async () => {
    const post = jest.fn().mockReturnValue(of({ data: { ResponseCode: 0, Tranzactions: [
      { TranzactionId: 22, Uid: 'source-uid', IsRefund: true, Amount: -1, ResponseCode: 0,
        TerminalNumber: 1000, CoinId: 1, Token: 'secret-token', CardOwnerEmail: 'private@example.invalid', Description: 'ok' },
    ] } }));
    const result = await adapter(post).listRefundEvidence(new Date('2026-10-20'), new Date('2026-10-21'));
    expect(post.mock.calls[0][0]).toContain('/ListTransactions');
    expect(post.mock.calls[0][1]).toMatchObject({ FromDate: '20102026', ToDate: '21102026', TranStatus: 'All', Page: 1 });
    expect(JSON.stringify(result)).not.toContain('secret-token'); expect(JSON.stringify(result)).not.toContain('private@example.invalid');
  });
});
