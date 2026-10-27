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
});
