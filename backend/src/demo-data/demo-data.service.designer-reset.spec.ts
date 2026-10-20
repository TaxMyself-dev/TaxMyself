import { Business } from '../business/business.entity';
import { User } from '../users/user.entity';
import { DemoDataService } from './demo-data.service';
import { DESIGNER_SANDBOX_PROFILE } from './profiles/designer-sandbox.profile';

describe('DemoDataService designer full reset', () => {
  it('rebuilds the full DB graph while preserving the Firebase identity', async () => {
    const firebaseId = 'designer-firebase-id';
    const manager = { query: jest.fn().mockResolvedValue(undefined) };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        firebaseId,
        email: DESIGNER_SANDBOX_PROFILE.email,
        index: 42,
      }),
    };
    const businessRepo = {
      find: jest.fn().mockResolvedValue([
        {
          businessNumber: DESIGNER_SANDBOX_PROFILE.businesses[0].businessNumber,
          driveInboxFolderId: null,
          driveProcessedFolderId: null,
        },
      ]),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => entity === User ? userRepo : entity === Business ? businessRepo : {}),
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const usersService = { ensureTrialSubscription: jest.fn().mockResolvedValue(undefined) };
    const service = new DemoDataService(
      dataSource as any,
      { listFolderFiles: jest.fn(), deleteFile: jest.fn() } as any,
      {} as any,
      usersService as any,
      {} as any,
      {} as any,
    );

    const purge = jest.spyOn(service as any, 'purgeUserData').mockImplementation(
      async (_manager: unknown, _firebaseId: string, counts: Record<string, number>) => {
        counts.users = 1;
        counts.bills = 2;
      },
    );
    const seed = jest.spyOn(service as any, 'seedUserAndData').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'seedDocumentsAndExpenses').mockResolvedValue(undefined);

    const result = await service.testReset(firebaseId);

    expect(purge).toHaveBeenCalledWith(manager, firebaseId, expect.any(Object));
    expect(seed).toHaveBeenCalledWith(manager, firebaseId, DESIGNER_SANDBOX_PROFILE, DESIGNER_SANDBOX_PROFILE);
    expect(usersService.ensureTrialSubscription).toHaveBeenCalledWith(firebaseId);
    expect(result.dbRowsReset).toEqual(expect.objectContaining({
      users: 1,
      bills: 2,
      fullCacheReseeded: DESIGNER_SANDBOX_PROFILE.transactions.length,
      sourceSyncStates: DESIGNER_SANDBOX_PROFILE.sourceSyncStates?.length,
    }));
  });
});
