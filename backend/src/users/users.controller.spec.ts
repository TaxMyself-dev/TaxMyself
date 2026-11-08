import { HttpException, NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  function subject(overrides: Record<string, unknown> = {}) {
    const userService = {
      signup: jest.fn().mockResolvedValue(undefined),
      signin: jest.fn().mockResolvedValue({ firebaseId: 'firebase-1' }),
      findFireUser: jest.fn().mockResolvedValue({ firebaseId: 'firebase-1' }),
      isAdmin: jest.fn().mockResolvedValue(true),
      getAllUsers: jest.fn().mockResolvedValue([{ firebaseId: 'firebase-1' }]),
      ...overrides,
    };
    const controller = new UsersController(
      userService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { controller, userService };
  }

  it('should be defined', () => {
    expect(subject().controller).toBeDefined();
  });

  it('delegates signup and returns the accepted DTO', async () => {
    const { controller, userService } = subject();
    const dto = { email: 'new-user@example.com' } as any;

    await expect(controller.createUser(dto)).resolves.toBe(dto);
    expect(userService.signup).toHaveBeenCalledWith(dto);
  });

  it('signs in the authenticated Firebase identity', async () => {
    const { controller, userService } = subject();
    const request = {
      user: { firebaseId: 'firebase-1' },
      query: {},
    } as any;

    await expect(controller.signin(request)).resolves.toEqual({ firebaseId: 'firebase-1' });
    expect(userService.signin).toHaveBeenCalledWith('firebase-1', false);
  });

  it('returns the authenticated user and rejects a missing one', async () => {
    const found = subject();
    await expect(found.controller.getUser({ user: { firebaseId: 'firebase-1' } } as any))
      .resolves.toEqual({ firebaseId: 'firebase-1' });

    const missing = subject({ findFireUser: jest.fn().mockResolvedValue(null) });
    await expect(missing.controller.getUser({ user: { firebaseId: 'missing' } } as any))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows only a persisted admin to list users', async () => {
    const allowed = subject();
    await expect(allowed.controller.getAllUsers({ user: { firebaseId: 'admin-1' } } as any))
      .resolves.toEqual([{ firebaseId: 'firebase-1' }]);
    expect(allowed.userService.isAdmin).toHaveBeenCalledWith('admin-1');

    const denied = subject({ isAdmin: jest.fn().mockResolvedValue(false) });
    await expect(denied.controller.getAllUsers({ user: { firebaseId: 'user-1' } } as any))
      .rejects.toBeInstanceOf(HttpException);
  });
});
