import { IsNull } from 'typeorm';
import { SourceType } from '../enum';
import { UserSyncStateService } from './user-sync-state.service';

/** A pull may finish after consent termination or renewal. Provider metadata is discovery-owned. */
describe('source outcomes after disconnection or reconnection', () => {
  function setup(existing: any) {
    const sources: any = { findOne: jest.fn().mockResolvedValue({ id: 7, userId: 'u', sourceName: '1234',
      sourceType: SourceType.CREDIT_CARD, connectionRole: 'primary' }) };
    const outcomes: any = { findOne: jest.fn().mockResolvedValue(existing), update: jest.fn(), upsert: jest.fn(), insert: jest.fn() };
    const service = new UserSyncStateService({} as any, outcomes, sources);
    return { service, outcomes };
  }
  it('does not overwrite a row discovered concurrently with a first-time pull', async () => {
    const { service, outcomes } = setup(null);
    outcomes.insert.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }));
    await expect(service.updateSourceResults('u', [incoming])).resolves.toBeUndefined();
    expect(outcomes.insert).toHaveBeenCalled();
    expect(outcomes.upsert).not.toHaveBeenCalled();
    expect(outcomes.update).not.toHaveBeenCalled();
  });
  it('propagates an actual first-insert database failure', async () => {
    const { service, outcomes } = setup(null);
    outcomes.insert.mockRejectedValue(new Error('database unavailable'));
    await expect(service.updateSourceResults('u', [incoming])).rejects.toThrow('database unavailable');
  });
  const incoming: any = { type: 'card', sourceId: '1234', sourceRecordId: 7, connectionRole: 'primary',
    consentId: 'old-consent', resourceId: 'old-resource', status: 'success', transactionCount: 5 };

  it('does not restore the consent of a pull that finishes after disconnection', async () => {
    const { service, outcomes } = setup({ consentId: null, resourceId: 'old-resource' });
    await service.updateSourceResults('u', [incoming]);
    expect(outcomes.update).not.toHaveBeenCalled();
    expect(outcomes.upsert).not.toHaveBeenCalled();
  });
  it('does not replace new consent/resource identifiers with an older pull result', async () => {
    const { service, outcomes } = setup({ consentId: 'new-consent', resourceId: 'new-resource' });
    await service.updateSourceResults('u', [incoming]);
    expect(outcomes.update).not.toHaveBeenCalled();
    expect(outcomes.upsert).not.toHaveBeenCalled();
  });
  it('updates outcomes only with an atomic predicate for the identifiers read before completion', async () => {
    const { service, outcomes } = setup({ consentId: 'old-consent', resourceId: 'old-resource' });
    await service.updateSourceResults('u', [incoming]);
    expect(outcomes.update).toHaveBeenCalledWith({ userId: 'u', sourceRecordId: 7,
      consentId: 'old-consent', resourceId: 'old-resource' }, { status: 'success', transactionCount: 5, error: null });
    expect(outcomes.upsert).not.toHaveBeenCalled();
  });
  it('does not write metadata from a failed result that lacks consent/resource identifiers', async () => {
    const { service, outcomes } = setup({ consentId: 'new-consent', resourceId: 'new-resource' });
    await service.updateSourceResults('u', [{ ...incoming, consentId: undefined, resourceId: undefined, status: 'failed', error: 'offline' }]);
    expect(outcomes.update).toHaveBeenCalledWith(expect.objectContaining({ consentId: 'new-consent', resourceId: 'new-resource' }),
      { status: 'failed', transactionCount: 5, error: 'offline' });
  });
  it('guards nullable metadata against a concurrent discovery instead of overwriting the row', async () => {
    const { service, outcomes } = setup({ consentId: null, resourceId: null });
    await service.updateSourceResults('u', [{ ...incoming, consentId: undefined, resourceId: undefined }]);
    expect(outcomes.update).toHaveBeenCalledWith(expect.objectContaining({ consentId: IsNull(), resourceId: IsNull() }),
      expect.objectContaining({ status: 'success' }));
  });
});
