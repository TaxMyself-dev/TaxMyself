import { DESIGNER_SANDBOX_PROFILE } from '../demo-data/profiles/designer-sandbox.profile';
import { UsersController } from './users.controller';

describe('UsersController synthetic demo login sync protection', () => {
  it('does not inspect Drive or call Feezback for the designer fixture', async () => {
    const usersService = { getDriveProvisioningStatus: jest.fn() };
    const feezbackService = { triggerFullSync: jest.fn() };
    const controller = new UsersController(
      usersService as any, {} as any, feezbackService as any, {} as any, {} as any,
    );

    await (controller as any).triggerPostLoginSync('designer-firebase-id', {
      email: DESIGNER_SANDBOX_PROFILE.email,
      hasOpenBanking: true,
      fName: 'נועה',
    });

    expect(usersService.getDriveProvisioningStatus).not.toHaveBeenCalled();
    expect(feezbackService.triggerFullSync).not.toHaveBeenCalled();
  });
});
