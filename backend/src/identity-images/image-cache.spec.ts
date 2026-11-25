import { ImageStorageService } from './image-storage.service';
import * as admin from 'firebase-admin';
jest.mock('firebase-admin', () => ({ storage: jest.fn() }));
const first =
  'identity-images/business/1/11111111-1111-4111-8111-111111111111.png';
const second =
  'identity-images/business/1/22222222-2222-4222-8222-222222222222.png';
describe('bounded immutable identity image cache', () => {
  let service: ImageStorageService;
  let download: jest.Mock;
  beforeEach(() => {
    service = new ImageStorageService();
    download = jest.fn().mockResolvedValue([Buffer.from('validated-logo')]);
    (admin.storage as unknown as jest.Mock).mockReturnValue({
      bucket: () => ({
        file: () => ({
          getMetadata: jest.fn().mockResolvedValue([{ size: 14 }]),
          download,
        }),
      }),
    });
    jest.spyOn(service, 'normalize').mockImplementation(async (bytes) => bytes);
  });
  afterEach(() => jest.restoreAllMocks());
  it('deduplicates concurrent downloads, retains bytes and protects cached data from mutation', async () => {
    const [one, two] = await Promise.all([
      service.download(first),
      service.download(first),
    ]);
    expect(download).toHaveBeenCalledTimes(1);
    one.buffer.fill(0);
    expect(two.buffer.toString()).toBe('validated-logo');
    expect((await service.download(first)).buffer.toString()).toBe(
      'validated-logo',
    );
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('downloads a replacement path immediately and rejects invalid paths before cache lookup', async () => {
    await service.download(first);
    await service.download(second);
    await expect(
      service.download('https://external.test/logo.png'),
    ).rejects.toThrow('Invalid image path');
    expect(download).toHaveBeenCalledTimes(2);
  });
  it('does not cache a failed download', async () => {
    download.mockRejectedValueOnce(Error('storage down'));
    await expect(service.download(first)).rejects.toThrow('storage down');
    await service.download(first);
    expect(download).toHaveBeenCalledTimes(2);
  });
  it('expires cached data after ten minutes', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    await service.download(first);
    clock.mockReturnValue(601001);
    await service.download(first);
    expect(download).toHaveBeenCalledTimes(2);
  });
  it('evicts the least recently used entry at the memory limit', async () => {
    (service as any).maxCachedBytes = 14;
    await service.download(first);
    await service.download(second);
    expect((service as any).cachedBytes).toBe(14);
    await service.download(first);
    expect(download).toHaveBeenCalledTimes(3);
  });
});
