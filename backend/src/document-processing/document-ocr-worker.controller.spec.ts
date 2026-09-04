import { InternalServerErrorException } from '@nestjs/common';
import { DocumentsService } from 'src/documents/documents.service';
import { DocumentOcrQueueService } from './document-ocr-queue.service';
import { DocumentOcrWorkerController } from './document-ocr-worker.controller';

describe('DocumentOcrWorkerController', () => {
  const assertAuthorized = jest.fn();
  const processInboxForUser = jest.fn();
  let controller: DocumentOcrWorkerController;

  beforeEach(() => {
    jest.clearAllMocks();
    assertAuthorized.mockResolvedValue(undefined);
    controller = new DocumentOcrWorkerController(
      { assertAuthorized } as unknown as DocumentOcrQueueService,
      { processInboxForUser } as unknown as DocumentsService,
    );
  });

  it('authenticates the task and processes the requested business inbox', async () => {
    processInboxForUser.mockResolvedValue({ processed: 2, failed: 0, total: 2 });

    await expect(
      controller.process('Bearer signed-token', {
        firebaseId: 'user-1',
        businessNumber: '123456789',
      }),
    ).resolves.toEqual({ ok: true, processed: 2, total: 2 });

    expect(assertAuthorized).toHaveBeenCalledWith('Bearer signed-token');
    expect(processInboxForUser).toHaveBeenCalledWith('user-1', '123456789');
  });

  it('returns an error so Cloud Tasks retries failed OCR files', async () => {
    processInboxForUser.mockResolvedValue({ processed: 0, failed: 1, total: 1 });

    await expect(
      controller.process('Bearer signed-token', {
        firebaseId: 'user-1',
        businessNumber: '123456789',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('does not process the inbox when task authentication fails', async () => {
    assertAuthorized.mockRejectedValue(new Error('invalid token'));

    await expect(
      controller.process('Bearer bad-token', {
        firebaseId: 'user-1',
        businessNumber: '123456789',
      }),
    ).rejects.toThrow('invalid token');
    expect(processInboxForUser).not.toHaveBeenCalled();
  });
});
