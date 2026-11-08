import { FeezbackHttpError } from './feezback-errors';
import { feeZbackErrorDiagnostic } from './feezback-error-diagnostic';

describe('Feezback error diagnostics', () => {
  it('preserves provider error details while hiding credentials, nested identity and echoed request tokens', () => {
    const error = new FeezbackHttpError({ method: 'POST', url: 'https://provider/link', status: 400,
      message: 'Bad request', responseBody: { error: 'invalid_redirect', description: 'Redirect not allowed',
        token: 'secret', nested: { authorization: 'Bearer sensitive', email: 'user@example.com' },
        detail: 'echo opaque-request-token', jwt: 'signed', code: 123 }, originalError: { config: { password: 'never serialize' } } });
    const result = feeZbackErrorDiagnostic(error, ['opaque-request-token']);
    expect(result).toContain('invalid_redirect');
    expect(result).toContain('Redirect not allowed');
    expect(result).toContain('123');
    for (const value of ['secret', 'sensitive', 'user@example.com', 'opaque-request-token', 'never serialize']) expect(result).not.toContain(value);
  });
  it('redacts JSON string response bodies and handles circular data', () => {
    const body: any = { message: 'Bearer abc', parsed: '{"access_token":"hidden","error":"invalid_signature"}' };
    body.cycle = body;
    const result = feeZbackErrorDiagnostic(new FeezbackHttpError({ method: 'POST', url: 'https://provider/token', message: 'failed', responseBody: body }));
    expect(result).toContain('invalid_signature');
    expect(result).not.toContain('hidden');
    expect(result).not.toContain('Bearer abc');
    expect(result).toContain('<OMITTED>');
  });
});

describe('bounded provider response diagnostics', () => {
  it('bounds large bodies without losing the provider code or JSON validity', () => {
    const body = { error: { code: 'INSUFFICIENT_CONSENT' }, detail: Array.from({ length: 1000 }, () => 'x'.repeat(10000)) };
    const output = feeZbackErrorDiagnostic(new FeezbackHttpError({ method: 'GET', url: 'https://provider/accounts',
      message: 'Denied', status: 401, responseBody: body }));
    expect(output.length).toBeLessThan(18000);
    expect(JSON.parse(output).providerCode).toBe('INSUFFICIENT_CONSENT');
    expect(output).toContain('<TRUNCATED>');
  });
});
