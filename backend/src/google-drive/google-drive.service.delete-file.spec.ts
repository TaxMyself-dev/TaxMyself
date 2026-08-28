import { InternalServerErrorException } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';

describe('GoogleDriveService.deleteFile', () => {
  function subject() {
    const service = new GoogleDriveService();
    const systemDelete = jest.fn().mockResolvedValue(undefined);
    const serviceDelete = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(service as any, 'getSystemDrive').mockReturnValue({
      files: { delete: systemDelete },
    });
    jest.spyOn(service as any, 'getDrive').mockReturnValue({
      drive: { files: { delete: serviceDelete } },
      rootFolderId: 'root-1',
    });
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

    return { service, systemDelete, serviceDelete };
  }

  it('deletes system-uploaded files with the owning system OAuth account', async () => {
    const test = subject();

    await expect(test.service.deleteFile('file-1')).resolves.toBeUndefined();

    expect(test.systemDelete).toHaveBeenCalledWith({
      fileId: 'file-1',
      supportsAllDrives: true,
    });
    expect(test.serviceDelete).not.toHaveBeenCalled();
  });

  it('falls back to the service account for a legacy file the system account cannot delete', async () => {
    const test = subject();
    test.systemDelete.mockRejectedValue({ code: 403, message: 'insufficient permissions' });

    await expect(test.service.deleteFile('legacy-file')).resolves.toBeUndefined();

    expect(test.serviceDelete).toHaveBeenCalledWith({
      fileId: 'legacy-file',
      supportsAllDrives: true,
    });
  });

  it('treats a missing file as already deleted without using the fallback', async () => {
    const test = subject();
    test.systemDelete.mockRejectedValue({ code: 404, message: 'not found' });

    await expect(test.service.deleteFile('missing-file')).resolves.toBeUndefined();

    expect(test.serviceDelete).not.toHaveBeenCalled();
  });

  it('treats a fallback 404 as success for a legacy file already gone', async () => {
    const test = subject();
    test.systemDelete.mockRejectedValue({ code: 403, message: 'insufficient permissions' });
    test.serviceDelete.mockRejectedValue({ code: 404, message: 'not found' });

    await expect(test.service.deleteFile('missing-legacy-file')).resolves.toBeUndefined();
  });

  it('returns a controlled error when neither Drive identity can delete the file', async () => {
    const test = subject();
    test.systemDelete.mockRejectedValue({ code: 403, message: 'system denied' });
    test.serviceDelete.mockRejectedValue({ code: 403, message: 'service denied' });

    await expect(test.service.deleteFile('foreign-file')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
