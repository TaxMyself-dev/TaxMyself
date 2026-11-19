import { readFileSync } from 'fs';
import { join } from 'path';
import { GmailReaderService } from '../integrations/services/gmail-reader.service';
import { UserIntegration } from '../integrations/entities/user-integration.entity';
describe('Password-required Gmail intake bridge', () => {
  const previous = process.env.PROTECTED_PDF_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.PROTECTED_PDF_ENABLED;
    else process.env.PROTECTED_PDF_ENABLED = previous;
  });
  it.each([true, false])(
    'forwards protected bytes only with durable lifecycle enabled=%s',
    async (enabled) => {
      process.env.PROTECTED_PDF_ENABLED = String(enabled);
      const content = readFileSync(
        join(
          __dirname,
          '../../test/fixtures/protected-pdf/password-required.pdf',
        ),
      );
      const provider: any = {
        listMessages: jest.fn().mockResolvedValue({ ids: ['message'] }),
        getMessage: jest
          .fn()
          .mockResolvedValue({
            id: 'message',
            payload: {
              headers: [{ name: 'Subject', value: 'Invoice' }],
              filename: 'invoice.pdf',
              mimeType: 'application/pdf',
              body: { data: content.toString('base64'), size: content.length },
            },
          }),
      };
      const reader = new GmailReaderService({} as any, provider),
        results = [];
      for await (const item of reader.scanMessages({
        id: 17,
        status: 'ACTIVE',
        connectionBackend: 'COMPOSIO',
        connectedAccountId: 'test',
        firebaseId: 'owner',
      } as UserIntegration))
        results.push(item);
      expect(results).toHaveLength(1);
      expect(results[0].failed).toBe(false);
      expect(results[0].attachments).toHaveLength(enabled ? 1 : 0);
      expect(results[0].reviewRequired).toBe(enabled ? 0 : 1);
      if (enabled)
        expect(results[0].attachments[0].matchedBy).toBe('password-required');
    },
  );
});
