import { promptDiagnostic } from './lychee-prompt-diagnostic';

describe('Prompt diagnostics: no HTTP and no raw credentials', () => {
  it('keeps status, provider reason and code while removing sensitive values', () => {
    const request = {
      channel_id: 'private-channel',
      phone: '972501234567',
      text: 'private caption',
      buttons: ['private business'],
      reply_to_whatsapp_message_id: 'private-document-id',
    };
    const priorKey = process.env.LYCHEE_API_KEY;
    process.env.LYCHEE_API_KEY = 'test-secret-key';
    try {
      const diagnostic = promptDiagnostic(
        {
          response: {
            status: 403,
            data: {
              code: 'MISSING_PERMISSION',
              message:
                'Requires conversations:write; test-secret-key private caption private business private-channel private-document-id 972501234567 https://host.test/?token=secret person@example.com\nAuthorization: Bearer other-secret',
              request,
              headers: { Authorization: 'must-never-be-logged' },
            },
          },
          config: { headers: { Authorization: 'also-hidden' } },
        },
        request,
      );
      expect(diagnostic).toMatchObject({
        httpStatus: 403,
        providerCode: 'MISSING_PERMISSION',
        failureKind: 'http',
      });
      expect(diagnostic.providerReason).toContain('conversations:write');
      const output = JSON.stringify(diagnostic);
      for (const secret of [
        'test-secret-key',
        ...Object.values(request).flat(),
        'other-secret',
        'person@example.com',
        'https://',
        'must-never-be-logged',
        'also-hidden',
      ])
        expect(output).not.toContain(secret);
    } finally {
      if (priorKey === undefined) delete process.env.LYCHEE_API_KEY;
      else process.env.LYCHEE_API_KEY = priorKey;
    }
  });
  it('accepts nested error messages, bounds text and ignores arbitrary response objects', () => {
    expect(
      promptDiagnostic({
        response: {
          status: 400,
          data: {
            error: { code: 'INVALID_BUTTONS', message: 'Invalid buttons' },
          },
        },
      }),
    ).toMatchObject({
      providerCode: 'INVALID_BUTTONS',
      providerReason: 'Invalid buttons',
    });
    expect(
      promptDiagnostic({
        response: { status: 500, data: { message: 'failure '.repeat(300) } },
      }).providerReason?.length,
    ).toBe(400);
    expect(
      promptDiagnostic({
        response: { status: 400, data: { error: { secret: 'hidden' } } },
      }).providerReason,
    ).toBeUndefined();
  });
  it('distinguishes network failure without copying raw exception messages', () => {
    expect(
      promptDiagnostic({
        code: 'ECONNABORTED',
        message: 'sensitive raw exception',
      }),
    ).toEqual({
      httpStatus: undefined,
      code: 'ECONNABORTED',
      providerCode: undefined,
      providerReason: undefined,
      failureKind: 'network',
    });
  });
});
