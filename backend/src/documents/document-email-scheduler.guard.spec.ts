import { UnauthorizedException } from '@nestjs/common';
import { DocumentEmailSchedulerGuard } from './document-email-scheduler.guard';
import { DocumentSchedulerGuard } from '../document-ai/document-ai-scheduler.guard';

describe('email scheduler identity and independent activation', () => {
  const env = { ...process.env };
  let verify: jest.Mock;
  let guard: DocumentEmailSchedulerGuard;
  let claims: any;
  const context = (authorization?: string): any => ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  });
  beforeEach(() => {
    process.env.DOCUMENT_EMAIL_QUEUE_ENABLED = 'true';
    process.env.DOCUMENT_EMAIL_QUEUE_RUNNER = 'scheduler';
    process.env.DOCUMENT_AI_DISPATCH_MODE = 'cron';
    process.env.DOCUMENT_AI_SCHEDULER_AUDIENCE = 'https://backend.example';
    process.env.DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT =
      'scheduler@project.iam.gserviceaccount.com';
    process.env.DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB =
      '123456789012345678901';
    claims = {
      aud: 'https://backend.example',
      email: 'scheduler@project.iam.gserviceaccount.com',
      sub: '123456789012345678901',
      email_verified: true,
      iss: 'https://accounts.google.com',
      exp: Date.now() / 1000 + 3600,
    };
    verify = jest.fn(async () => claims);
    guard = new DocumentEmailSchedulerGuard({ verify });
  });
  afterEach(() => {
    process.env = { ...env };
  });
  it('accepts the configured identity without activating AI scheduling', async () => {
    expect(() => guard.onModuleInit()).not.toThrow();
    await expect(
      guard.canActivate(context('Bearer scheduler-token')),
    ).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith(
      'scheduler-token',
      'https://backend.example',
    );
    expect(process.env.DOCUMENT_AI_DISPATCH_MODE).toBe('cron');
    // The original AI route remains disabled under precisely the same settings.
    await expect(
      new DocumentSchedulerGuard({ verify }).canActivate(
        context('Bearer scheduler-token'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it.each([undefined, 'Basic token', 'Bearer token with spaces'])(
    'rejects missing/malformed credentials %s',
    async (header) => {
      await expect(guard.canActivate(context(header))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(verify).not.toHaveBeenCalled();
    },
  );
  it.each(['aud', 'email', 'sub', 'iss', 'email_verified', 'exp'])(
    'rejects mismatched/expired %s',
    async (field) => {
      claims[field] =
        field === 'email_verified' ? false : field === 'exp' ? 1 : 'wrong';
      await expect(
        guard.canActivate(context('Bearer token')),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
  it('rejects when email scheduler mode is disabled', async () => {
    process.env.DOCUMENT_EMAIL_QUEUE_RUNNER = 'cron';
    await expect(
      guard.canActivate(context('Bearer token')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('fails startup for missing scheduler identity configuration', () => {
    delete process.env.DOCUMENT_AI_SCHEDULER_SERVICE_ACCOUNT_SUB;
    expect(() => guard.onModuleInit()).toThrow('requires exact service URL');
  });
});
