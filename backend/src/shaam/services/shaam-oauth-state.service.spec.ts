import { UnauthorizedException } from '@nestjs/common';
import { ShaamEnvironment } from '../shaam.constants';
import { ShaamProduct } from '../entities/shaam.enums';
import { ShaamOauthStateService } from './shaam-oauth-state.service';

describe('ShaamOauthStateService', () => {
  function setup(row: any = null) {
    const locked = { setLock: jest.fn(), where: jest.fn(), getOne: jest.fn().mockResolvedValue(row) };
    locked.setLock.mockReturnValue(locked);
    locked.where.mockReturnValue(locked);
    const deleteQb = { delete: jest.fn(), where: jest.fn(), execute: jest.fn().mockResolvedValue({}) };
    deleteQb.delete.mockReturnValue(deleteQb);
    deleteQb.where.mockReturnValue(deleteQb);
    const txRepo = { createQueryBuilder: jest.fn().mockReturnValue(locked), save: jest.fn(async (value) => value) };
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(deleteQb),
      create: jest.fn((value) => value), save: jest.fn(async (value) => value),
      manager: { transaction: jest.fn(async (fn) => fn({ getRepository: () => txRepo })) },
    };
    return { service: new ShaamOauthStateService(repo as any), deleteQb, txRepo };
  }

  it('deletes only expired rows when creating a state', async () => {
    const { service, deleteQb } = setup();
    await service.create(7, 'actor', ShaamProduct.UNIFORM_FILE, ShaamEnvironment.TSANDBOX);
    expect(deleteQb.where).toHaveBeenCalledWith('expires_at < :now', { now: expect.any(Date) });
  });

  it('consumes a valid state once under a write lock', async () => {
    const row = { consumedAt: null, expiresAt: new Date(Date.now() + 60_000) };
    const { service, txRepo } = setup(row);
    await expect(service.consume('opaque-state')).resolves.toMatchObject({ consumedAt: expect.any(Date) });
    expect(txRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects an already-consumed state', async () => {
    const { service } = setup({ consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.consume('opaque-state')).rejects.toThrow(UnauthorizedException);
  });
});
