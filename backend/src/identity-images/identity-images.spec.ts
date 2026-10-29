import { DelegationScope } from '../delegation/delegation.entity';
import sharp = require('sharp');
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ImageStorageService, IMAGE_MAX_BYTES } from './image-storage.service';
import { BusinessLogoController } from './business-logo.controller';
import { UsersService } from '../users/users.service';
import { BusinessService } from '../business/business.service';
import { ProfileImageController } from './profile-image.controller';

jest.mock('firebase-admin', () => ({ storage: jest.fn() }));
import * as admin from 'firebase-admin';

describe('Identity images', () => {
  const images = new ImageStorageService();
  const request = { user: { firebaseId: 'owner', role: 'user' } } as any;
  const png = () =>
    sharp({
      create: { width: 20, height: 12, channels: 4, background: '#ff000080' },
    })
      .png()
      .toBuffer();
  it('fully decodes and preserves alpha, with bounded output', async () => {
    const result = await images.normalize(await png(), 'business');
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(20);
  });
  it('rejects SVG, spoofed/truncated PNG, oversized bytes and pixels', async () => {
    for (const buffer of [
      Buffer.from('<svg width="10" height="10"></svg>'),
      (await png()).subarray(0, 24),
      Buffer.alloc(IMAGE_MAX_BYTES + 1),
    ]) {
      await expect(images.normalize(buffer, 'business')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    const large = await sharp({
      create: { width: 4001, height: 4000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(images.normalize(large, 'user')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('rejects arbitrary download URLs and bucket paths before storage', async () => {
    for (const path of [
      'https://example.com/a.png',
      'documents/secret.pdf',
      'identity-images/business/1/../../x.png',
    ]) {
      await expect(images.download(path)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(admin.storage).not.toHaveBeenCalled();
  });
  it('uploads under immutable UUID paths and strips supplied filenames', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const file = jest.fn().mockReturnValue({ save });
    (admin.storage as jest.Mock).mockReturnValue({ bucket: () => ({ file }) });
    const first = await images.upload('business', 2, await png());
    const second = await images.upload('business', 2, await png());
    expect(first).toMatch(/^identity-images\/business\/2\/[a-f0-9-]+\.png$/);
    expect(second).not.toBe(first);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('scopes logo queries to the represented owner and rejects another business', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const storage = { upload: jest.fn() };
    const controller = new BusinessLogoController(repo as any, storage as any);
    await expect(
      controller.upload(request, 5, { buffer: Buffer.from('x') } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 5, firebaseId: 'owner' },
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('keeps old logo association on upload failure; replacement/removal never delete historical blobs', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 5, logoPath: 'old' }),
      update: jest.fn(),
    };
    const storage = {
      upload: jest.fn().mockRejectedValue(new Error('storage failed')),
      delete: jest.fn(),
    };
    const controller = new BusinessLogoController(repo as any, storage as any);
    await expect(
      controller.upload(request, 5, { buffer: Buffer.from('x') } as any),
    ).rejects.toThrow('storage failed');
    expect(repo.update).not.toHaveBeenCalled();
    storage.upload.mockResolvedValue('new' as never);
    expect(
      await controller.upload(request, 5, { buffer: Buffer.from('x') } as any),
    ).toEqual({ imagePath: 'new' });
    expect(await controller.remove(request, 5)).toEqual({ imagePath: null });
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it('uses DOCUMENTS_READ on each business asset handler (guard reads handler metadata)', () => {
    for (const method of ['upload', 'get', 'remove']) {
      expect(
        Reflect.getMetadata(
          'requiredDelegationScope',
          BusinessLogoController.prototype[method],
        ),
      ).toBe(DelegationScope.DOCUMENTS_READ);
    }
  });
  it('serves authenticated bytes with private no-store and rejects missing images', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 5, logoPath: null }),
    };
    const storage = {
      download: jest
        .fn()
        .mockResolvedValue({
          buffer: Buffer.from('png'),
          contentType: 'image/png',
        }),
    };
    const controller = new BusinessLogoController(repo as any, storage as any);
    const res = { set: jest.fn().mockReturnThis(), send: jest.fn() };
    await expect(controller.get(request, 5, res as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    repo.findOne.mockResolvedValue({ id: 5, logoPath: 'owned' } as any);
    await controller.get(request, 5, res as any);
    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    expect(res.send).toHaveBeenCalledWith(Buffer.from('png'));
  });
  it('generic profile updates cannot inject asset paths', async () => {
    const service = Object.create(UsersService.prototype);
    const user = { profileImagePath: 'owned', logoPath: undefined };
    service.user_repo = {
      findOneBy: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockImplementation((u) => u),
    };
    await service.updateUser('owner', {
      fName: 'updated',
      profileImagePath: 'foreign',
      logoPath: 'foreign',
    } as any);
    expect(user.profileImagePath).toBe('owned');
    expect(user.logoPath).toBeUndefined();
  });
  it('generic business updates do not assign injected logo paths', async () => {
    const service = Object.create(BusinessService.prototype);
    const business = {
      id: 2,
      logoPath: 'owned',
      businessType: null,
      businessNumber: '123',
    };
    service.businessRepo = {
      findOne: jest.fn().mockResolvedValue(business),
      save: jest.fn().mockImplementation((b) => b),
    };
    await service.updateBusiness('owner', {
      id: 2,
      logoPath: 'foreign',
    } as any);
    expect(business.logoPath).toBe('owned');
  });
  it('blocks agent profile mutations before loading or uploading', async () => {
    const repo = { findOne: jest.fn(), update: jest.fn() };
    const storage = { upload: jest.fn() };
    const controller = new ProfileImageController(repo as any, storage as any);
    const agent = { user: { firebaseId: 'client', role: 'agent' } } as any;
    await expect(controller.upload(agent, {} as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.remove(agent)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});
