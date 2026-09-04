import { UnauthorizedException } from '@nestjs/common';
import { google } from 'googleapis';
import { DocumentOcrQueueService } from './document-ocr-queue.service';

describe('DocumentOcrQueueService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...originalEnv,
      DOCUMENT_OCR_QUEUE_ENABLED: 'true',
      DOCUMENT_OCR_QUEUE_PROJECT_ID: 'test-project',
      DOCUMENT_OCR_QUEUE_LOCATION: 'me-west1',
      DOCUMENT_OCR_QUEUE_NAME: 'document-ocr',
      DOCUMENT_OCR_QUEUE_TARGET_URL:
        'https://backend.example.run.app/internal/tasks/document-ocr',
      DOCUMENT_OCR_QUEUE_SERVICE_ACCOUNT_EMAIL:
        'document-ocr-invoker@test-project.iam.gserviceaccount.com',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates an authenticated deterministic HTTP task', async () => {
    const create = jest.fn().mockResolvedValue({ data: {} });
    jest.spyOn(google, 'cloudtasks').mockReturnValue({
      projects: { locations: { queues: { tasks: { create } } } },
    } as any);

    const service = new DocumentOcrQueueService();
    await expect(
      service.enqueue(
        { firebaseId: 'user-1', businessNumber: '123456789' },
        'mailgun-imports:17',
      ),
    ).resolves.toEqual({ queued: true, duplicate: false });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      parent: 'projects/test-project/locations/me-west1/queues/document-ocr',
      requestBody: {
        task: expect.objectContaining({
          name: expect.stringMatching(/\/tasks\/ocr-[a-f0-9]{32}$/),
          dispatchDeadline: '900s',
          httpRequest: expect.objectContaining({
            httpMethod: 'POST',
            url: 'https://backend.example.run.app/internal/tasks/document-ocr',
            oidcToken: {
              serviceAccountEmail:
                'document-ocr-invoker@test-project.iam.gserviceaccount.com',
              audience: 'https://backend.example.run.app',
            },
          }),
        }),
      },
    }));
  });

  it('treats an existing task name as an idempotent success', async () => {
    const create = jest.fn().mockRejectedValue({ code: 409 });
    jest.spyOn(google, 'cloudtasks').mockReturnValue({
      projects: { locations: { queues: { tasks: { create } } } },
    } as any);

    await expect(
      new DocumentOcrQueueService().enqueue(
        { firebaseId: 'user-1', businessNumber: '123456789' },
        'mailgun-imports:17',
      ),
    ).resolves.toEqual({ queued: true, duplicate: true });
  });

  it('does not initialize Google Cloud when queueing is disabled', async () => {
    process.env.DOCUMENT_OCR_QUEUE_ENABLED = 'false';
    const cloudtasks = jest.spyOn(google, 'cloudtasks');

    await expect(
      new DocumentOcrQueueService().enqueue({
        firebaseId: 'user-1',
        businessNumber: '123456789',
      }),
    ).resolves.toEqual({ queued: false, duplicate: false });
    expect(cloudtasks).not.toHaveBeenCalled();
  });

  it('rejects a worker request without an OIDC bearer token', async () => {
    await expect(
      new DocumentOcrQueueService().assertAuthorized(undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
