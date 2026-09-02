import { DocumentImportService } from './document-import.service';

describe('DocumentImportService Drive cleanup logging', () => {
  const deleteFile = jest.fn();
  let service: DocumentImportService;
  let debug: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    deleteFile.mockResolvedValue(undefined);
    service = new DocumentImportService(
      {} as any,
      {} as any,
      { deleteFile } as any,
      {} as any,
    );
    debug = jest
      .spyOn((service as any).logger, 'debug')
      .mockImplementation(() => undefined);
    warn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);
  });

  it('logs expected duplicate cleanup as debug instead of a DB failure warning', async () => {
    await (service as any).cleanupDriveFile(
      'duplicate-file-id',
      'invoice.pdf',
      'duplicate',
    );

    expect(deleteFile).toHaveBeenCalledWith('duplicate-file-id');
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining('deduplication race'),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a warning for cleanup caused by a real DB insert failure', async () => {
    await (service as any).cleanupDriveFile(
      'rollback-file-id',
      'invoice.pdf',
      'db-insert-failure',
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('after failed DB insert'),
    );
    expect(debug).not.toHaveBeenCalled();
  });
});
