jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
}));

import * as admin from 'firebase-admin';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('initializes the thin Firebase Admin auth wrapper', () => {
    const service = new AuthService({} as any, {} as any);

    expect(service).toBeDefined();
    expect(admin.auth).toHaveBeenCalledTimes(1);
  });
});
