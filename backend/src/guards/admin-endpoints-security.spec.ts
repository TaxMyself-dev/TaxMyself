import { GUARDS_METADATA } from '@nestjs/common/constants';

import { UsersController } from '../users/users.controller';
import { AdminGuard } from './admin.guard';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { ShaamSecureController } from '../shaam/shaam-secure.controller';

describe('administrative endpoint authorization', () => {
  it.each([
    ['auth/dev/drive/create-folder/:userId', UsersController.prototype.devCreateDriveFolder],
    ['shaam/admin/invoices/allocation/unknown', ShaamSecureController.prototype.listUnknownAllocationAttempts],
    ['shaam/admin/invoices/allocation/:attemptId/resolve', ShaamSecureController.prototype.resolveUnknownAllocation],
  ])('requires Firebase authentication and the persisted admin role for %s', (_route, handler) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    expect(guards).toEqual([FirebaseAuthGuard, AdminGuard]);
  });
});
