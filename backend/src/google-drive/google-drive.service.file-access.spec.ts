import { InternalServerErrorException } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';

describe('GoogleDriveService file access across Drive identities', () => {
  function subject() {
    const service = new GoogleDriveService();
    const systemList = jest.fn();
    const serviceList = jest.fn();
    const systemGet = jest.fn();
    const serviceGet = jest.fn();
    const systemUpdate = jest.fn();
    const serviceUpdate = jest.fn();

    jest.spyOn(service as any, 'getSystemDrive').mockReturnValue({
      files: { list: systemList, get: systemGet, update: systemUpdate },
    });
    jest.spyOn(service as any, 'getDrive').mockReturnValue({
      drive: {
        files: { list: serviceList, get: serviceGet, update: serviceUpdate },
      },
      rootFolderId: 'root-1',
    });
    jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);
    jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    return {
      service,
      systemList,
      serviceList,
      systemGet,
      serviceGet,
      systemUpdate,
      serviceUpdate,
    };
  }

  const file = (id: string, name: string) => ({
    id,
    name,
    mimeType: 'application/pdf',
    size: '12',
    createdTime: '2026-09-04T00:00:00.000Z',
    md5Checksum: `md5-${id}`,
  });

  it('unions files visible to either identity and deduplicates shared results', async () => {
    const test = subject();
    test.systemList.mockResolvedValue({
      data: {
        files: [
          file('mailgun-file', 'mail.pdf'),
          file('shared-file', 'shared.pdf'),
        ],
      },
    });
    test.serviceList.mockResolvedValue({
      data: {
        files: [
          file('legacy-file', 'legacy.pdf'),
          file('shared-file', 'shared.pdf'),
        ],
      },
    });

    const result = await test.service.listFolderFiles('inbox-1');

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mailgun-file' }),
        expect.objectContaining({ id: 'legacy-file' }),
        expect.objectContaining({ id: 'shared-file' }),
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it('returns the available identity results when the other identity cannot list', async () => {
    const test = subject();
    test.systemList.mockResolvedValue({
      data: { files: [file('mailgun-file', 'mail.pdf')] },
    });
    test.serviceList.mockRejectedValue({
      code: 403,
      message: 'service denied',
    });

    await expect(test.service.listFolderFiles('inbox-1')).resolves.toEqual([
      expect.objectContaining({ id: 'mailgun-file' }),
    ]);
  });

  it('fails listing only when neither identity can read the folder', async () => {
    const test = subject();
    test.systemList.mockRejectedValue({ code: 403, message: 'system denied' });
    test.serviceList.mockRejectedValue({
      code: 403,
      message: 'service denied',
    });

    await expect(
      test.service.listFolderFiles('inbox-1'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('downloads system-owned files with the system account', async () => {
    const test = subject();
    test.systemGet.mockResolvedValue({
      data: Uint8Array.from([1, 2, 3]).buffer,
    });

    await expect(test.service.downloadFile('mailgun-file')).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(test.serviceGet).not.toHaveBeenCalled();
  });

  it('falls back to the service account when downloading a legacy file', async () => {
    const test = subject();
    test.systemGet.mockRejectedValue({ code: 404, message: 'not found' });
    test.serviceGet.mockResolvedValue({ data: Uint8Array.from([4, 5]).buffer });

    await expect(test.service.downloadFile('legacy-file')).resolves.toEqual(
      Buffer.from([4, 5]),
    );
  });

  it('moves system-owned files with the system account', async () => {
    const test = subject();
    test.systemUpdate.mockResolvedValue({ data: { id: 'mailgun-file' } });

    await expect(
      test.service.moveFile('mailgun-file', 'inbox-1', 'processed-1'),
    ).resolves.toBeUndefined();
    expect(test.serviceUpdate).not.toHaveBeenCalled();
  });

  it('falls back to the service account when moving a legacy file', async () => {
    const test = subject();
    test.systemUpdate.mockRejectedValue({
      code: 403,
      message: 'system denied',
    });
    test.serviceUpdate.mockResolvedValue({ data: { id: 'legacy-file' } });

    await expect(
      test.service.moveFile('legacy-file', 'inbox-1', 'processed-1'),
    ).resolves.toBeUndefined();
  });
});
