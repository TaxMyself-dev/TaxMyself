jest.mock('firebase-admin', () => ({ auth: jest.fn(() => ({})) }));
import { UsersService } from './users.service';
import { ACQUIRE_DRIVE_LOCK, RELEASE_DRIVE_LOCK, withDriveProvisioningLock } from './drive-provisioning-lock';

describe('Drive provisioning ownership lock', () => {
  function source(acquired = 1) {
    const runner = { connect: jest.fn(), query: jest.fn().mockResolvedValue([{ acquired }]), release: jest.fn() };
    return { runner, db: { createQueryRunner: () => runner } as any };
  }
  it('releases the exact connection lock and connection after a provisioning failure', async () => {
    const {runner, db} = source();
    await expect(withDriveProvisioningLock(db, 'uid', async () => { throw new Error('Drive unavailable'); })).rejects.toThrow('Drive unavailable');
    expect(runner.query.mock.calls).toEqual([[ACQUIRE_DRIVE_LOCK, ['uid']], [RELEASE_DRIVE_LOCK, ['uid']]]);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
  it('does not provision when the lock times out', async () => {
    const {runner, db} = source(0);
    const action = jest.fn();
    await expect(withDriveProvisioningLock(db, 'uid', action)).rejects.toThrow('lock');
    expect(action).not.toHaveBeenCalled();
    expect(runner.query).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalled();
  });
  it('serializes two service instances and re-reads the saved folder instead of using stale signup snapshots', async () => {
    let tail = Promise.resolve();
    const db = { createQueryRunner: () => {
      let unlock: () => void;
      return {
        connect: async () => undefined, release: async () => undefined,
        manager: {getRepository: () => ({findOne: jest.fn(async () => ({...stored}))})},
        query: async (sql: string) => {
          if (sql === ACQUIRE_DRIVE_LOCK) {
            const previous = tail;
            tail = new Promise<void>(resolve => { unlock = resolve; });
            await previous;
            return [{ acquired: 1 }];
          }
          unlock(); return [{ released: 1 }];
        },
      };
    }};
    const stored = {index: 1, firebaseId: 'uid', driveFolderId: null as string | null};
    const provision = jest.fn(async user => {
      if (!user.driveFolderId) {
        await Promise.resolve();
        stored.driveFolderId = 'one-folder';
      }
    });
    const service = () => Object.assign(Object.create(UsersService.prototype), {
      dataSource: db, user_repo: {findOne: jest.fn(async () => ({...stored}))},
      provisionDriveStructureUnlocked: provision,
    }) as UsersService;
    const stale = {...stored};
    await Promise.all([service().provisionDriveStructure({...stale} as any), service().provisionDriveStructure({...stale} as any)]);
    expect(provision.mock.calls.map(([user]) => user.driveFolderId)).toEqual([null, 'one-folder']);
  });
  it('cannot recreate folders for a user deleted by cleanup while waiting for the lock', async () => {
    const {db} = source();
    db.createQueryRunner().manager = {getRepository: () => ({findOne: jest.fn().mockResolvedValue(null)})};
    const provision = jest.fn();
    const service = Object.assign(Object.create(UsersService.prototype), {
      dataSource: db, user_repo: {findOne: jest.fn().mockResolvedValue(null)}, provisionDriveStructureUnlocked: provision,
    });
    await service.provisionDriveStructure({index: 1, firebaseId: 'gone'});
    expect(provision).not.toHaveBeenCalled();
  });
});
