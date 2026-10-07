import { UsersService } from './users.service';
describe('provider-owned user connection flag', () => {
  it('does not allow profile updates to forge or clear the verified banking flag', async () => {
    const user = { firebaseId: 'owner', hasOpenBanking: true, fName: 'Old' };
    const service: any = Object.create(UsersService.prototype);
    service.user_repo = { findOneBy: jest.fn().mockResolvedValue(user), save: jest.fn(async value => value) };
    await service.updateUser('owner', { hasOpenBanking: false, fName: 'New' });
    expect(user.hasOpenBanking).toBe(true); expect(user.fName).toBe('New');
  });
});
