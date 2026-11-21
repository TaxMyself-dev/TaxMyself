import { MatchingService } from '../reports/matching.service';
import { ExtractedDocument } from '../documents/extracted-document.entity';
describe('queued transaction-link completion (mock DB)', () => {
  function subject() {
    const doc: any = {
        id: 1,
        userId: 8,
        businessNumber: 'biz',
        matchedTransactionId: null,
      },
      slim: any = {
        id: 2,
        userId: 'owner',
        businessNumber: 'biz',
        matchedDocumentId: null,
      };
    const docs = {
        findOne: jest.fn().mockResolvedValue(doc),
        update: jest.fn(),
      },
      slims = { findOne: jest.fn().mockResolvedValue(slim), update: jest.fn() };
    const manager = {
      getRepository: (entity: any) =>
        entity === ExtractedDocument ? docs : slims,
    };
    const db = { transaction: async (fn: any) => fn(manager) };
    return {
      doc,
      slim,
      docs,
      slims,
      service: new MatchingService(
        docs as any,
        slims as any,
        {} as any,
        db as any,
      ),
    };
  }
  it('locks and revalidates ownership of both rows inside the transaction', async () => {
    const t = subject();
    await t.service.linkQueuedDocToTx('owner', 8, 'biz', 1, 2);
    expect(t.docs.findOne).toHaveBeenCalledWith({
      where: { id: 1, userId: 8, businessNumber: 'biz' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(t.slims.findOne).toHaveBeenCalledWith({
      where: { id: 2, userId: 'owner', businessNumber: 'biz' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(t.docs.update).toHaveBeenCalledTimes(1);
    expect(t.slims.update).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite another link that appeared during the AI wait', async () => {
    const t = subject();
    t.slim.matchedDocumentId = 99;
    await expect(
      t.service.linkQueuedDocToTx('owner', 8, 'biz', 1, 2),
    ).rejects.toThrow('changed');
    expect(t.docs.update).not.toHaveBeenCalled();
  });
  it('does not attach to a transaction that was approved meanwhile', async () => {
    const t = subject();
    t.slim.confirmed = true;
    await expect(
      t.service.linkQueuedDocToTx('owner', 8, 'biz', 1, 2),
    ).rejects.toThrow('unavailable');
    expect(t.docs.update).not.toHaveBeenCalled();
  });
  it('acknowledges its already completed link after a completion-status crash', async () => {
    const t = subject();
    t.doc.matchedTransactionId = 2;
    t.slim.matchedDocumentId = 1;
    t.slim.confirmed = true;
    await t.service.linkQueuedDocToTx('owner', 8, 'biz', 1, 2);
    expect(t.docs.update).not.toHaveBeenCalled();
  });
  it('rejects an absent/foreign target before writing', async () => {
    const t = subject();
    t.slims.findOne.mockResolvedValue(null);
    await expect(
      t.service.linkQueuedDocToTx('owner', 8, 'biz', 1, 2),
    ).rejects.toThrow('unavailable');
    expect(t.docs.update).not.toHaveBeenCalled();
  });
});
