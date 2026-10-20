import { ConflictException } from '@nestjs/common';
import { DESIGNER_SANDBOX_PROFILE } from '../demo-data/profiles/designer-sandbox.profile';
import { TransactionsController } from './transactions.controller';

describe('TransactionsController synthetic demo sync protection', () => {
  const firebaseId = 'designer-firebase-id';
  const request = { user: { firebaseId } } as any;

  const buildController = (email: string) => {
    const syncState = { getSyncState: jest.fn().mockResolvedValue({ fullProcessStatus: 'completed' }) };
    const users = { findByFirebaseId: jest.fn().mockResolvedValue({ email }) };
    const feezback = {
      retrySource: jest.fn().mockResolvedValue({ status: 'success' }),
      triggerFullSync: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new TransactionsController(
      {} as any, {} as any, {} as any, syncState as any,
      users as any, feezback as any, {} as any, {} as any,
    );
    return { controller, syncState, feezback };
  };

  it('blocks full manual sync without calling Feezback', async () => {
    const { controller, feezback, syncState } = buildController(DESIGNER_SANDBOX_PROFILE.email);
    await expect(controller.triggerSync(request)).rejects.toBeInstanceOf(ConflictException);
    expect(syncState.getSyncState).not.toHaveBeenCalled();
    expect(feezback.triggerFullSync).not.toHaveBeenCalled();
  });

  it('blocks per-source retry without calling Feezback', async () => {
    const { controller, feezback, syncState } = buildController(DESIGNER_SANDBOX_PROFILE.email);
    await expect(controller.retrySource(request, { type: 'bank', sourceId: '4821907' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(syncState.getSyncState).not.toHaveBeenCalled();
    expect(feezback.retrySource).not.toHaveBeenCalled();
  });

  it('keeps ordinary users on the existing manual-sync path', async () => {
    const { controller, feezback } = buildController('customer@example.com');
    await expect(controller.triggerSync(request)).resolves.toEqual({ status: 'started' });
    expect(feezback.triggerFullSync).toHaveBeenCalledWith(firebaseId, 'manual');
  });
});
