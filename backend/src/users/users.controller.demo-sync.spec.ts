import { DESIGNER_SANDBOX_PROFILE } from '../demo-data/profiles/designer-sandbox.profile';
import { PARTNER_CANDIDATE_COUPLE_PROFILE } from '../demo-data/profiles/partner-candidate-couple.profile';
import { UsersController } from './users.controller';

describe('UsersController synthetic demo login sync protection', () => {
  it.each([DESIGNER_SANDBOX_PROFILE, PARTNER_CANDIDATE_COUPLE_PROFILE])(
    'does not inspect Drive or call Feezback for $id',
    async (profile) => {
      const usersService = { getDriveProvisioningStatus: jest.fn() };
      const feezbackService = { triggerFullSync: jest.fn() };
      const controller = new UsersController(
        usersService as any, {} as any, feezbackService as any, {} as any, {} as any,
      );

      await (controller as any).triggerPostLoginSync('synthetic-demo-firebase-id', {
        email: profile.email,
        hasOpenBanking: true,
        fName: profile.user.fName,
      });

      expect(usersService.getDriveProvisioningStatus).not.toHaveBeenCalled();
      expect(feezbackService.triggerFullSync).not.toHaveBeenCalled();
    },
  );
});
