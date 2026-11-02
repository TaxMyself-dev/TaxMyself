import { ForbiddenException } from '@nestjs/common';
import { DemoDataController } from './demo-data.controller';
import { DESIGNER_SANDBOX_PROFILE } from './profiles/designer-sandbox.profile';

describe('DemoDataController.testReset', () => {
  const firebaseId = 'designer-firebase-id';
  let service: { testReset: jest.Mock };
  let usersService: { findByFirebaseId: jest.Mock };
  let controller: DemoDataController;

  beforeEach(() => {
    service = { testReset: jest.fn().mockResolvedValue({ filesDeleted: 0 }) };
    usersService = { findByFirebaseId: jest.fn() };
    controller = new DemoDataController(service as any, usersService as any);
  });

  const request = { user: { firebaseId } } as any;

  it('allows only the explicitly capable designer profile', async () => {
    usersService.findByFirebaseId.mockResolvedValue({ email: DESIGNER_SANDBOX_PROFILE.email });
    await expect(controller.testReset(request)).resolves.toEqual({ filesDeleted: 0 });
    expect(service.testReset).toHaveBeenCalledWith(firebaseId);
  });

  it('rejects another registered demo profile', async () => {
    usersService.findByFirebaseId.mockResolvedValue({ email: 'demo+ocr-test@taxmyself.local' });
    await expect(controller.testReset(request)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.testReset).not.toHaveBeenCalled();
  });

  it('rejects a regular user and a missing auth context', async () => {
    usersService.findByFirebaseId.mockResolvedValue({ email: 'customer@example.com' });
    await expect(controller.testReset(request)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.testReset({} as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.testReset).not.toHaveBeenCalled();
  });
});
