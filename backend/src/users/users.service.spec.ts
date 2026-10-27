jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({})),
}));

import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not recreate a user deleted while Drive provisioning is in flight', async () => {
    const userRepo = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const businessRepo = { find: jest.fn() };
    const drive = {
      createUserFolder: jest.fn().mockResolvedValue('new-drive-folder'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(
      {} as any,
      userRepo as any,
      businessRepo as any,
      {} as any,
      {} as any,
      {} as any,
      drive as any,
      {} as any,
      {} as any,
    );
    const user = {
      index: 64,
      firebaseId: 'firebase-smoke-uid',
      email: 'smoke-test@keepintax.co.il',
      fName: 'Keepintax',
      lName: 'Smokeabcdefghijkl',
      driveFolderId: null,
    } as any;

    await service.provisionDriveStructure(user);

    expect(userRepo.update).toHaveBeenCalledWith(
      { index: user.index, firebaseId: user.firebaseId },
      { driveFolderId: 'new-drive-folder' },
    );
    expect(drive.deleteFile).toHaveBeenCalledWith('new-drive-folder');
    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { index: user.index, firebaseId: user.firebaseId },
      select: ['driveFolderId'],
    });
    expect(businessRepo.find).not.toHaveBeenCalled();
  });
});
