import { GUARDS_METADATA } from '@nestjs/common/constants';

import { UsersController } from '../users/users.controller';
import { AdminGuard } from './admin.guard';
import { FirebaseAuthGuard } from './firebase-auth.guard';

describe('administrative endpoint authorization', () => {
  it.each([
    ['auth/dev/drive/create-folder/:userId', UsersController.prototype.devCreateDriveFolder],
  ])('requires Firebase authentication and the persisted admin role for %s', (_route, handler) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(guards).toEqual([FirebaseAuthGuard, AdminGuard]);
  });
});
