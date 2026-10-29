import { requiredSmokeEnv } from './smoke-env';

describe('requiredSmokeEnv', () => {
  it('reads an ordinary environment value', () => {
    expect(requiredSmokeEnv('VALUE', { VALUE: 'plain' })).toBe('plain');
  });

  it('decodes a base64 transport value without trimming its contents', () => {
    const value = 'line one\nline two';
    expect(
      requiredSmokeEnv('VALUE', {
        VALUE_B64: Buffer.from(value, 'utf8').toString('base64'),
      }),
    ).toBe(value);
  });

  it('rejects ambiguous plain and encoded inputs', () => {
    expect(() =>
      requiredSmokeEnv('VALUE', {
        VALUE: 'plain',
        VALUE_B64: Buffer.from('encoded').toString('base64'),
      }),
    ).toThrow('cannot both be set');
  });

  it('rejects malformed base64', () => {
    expect(() =>
      requiredSmokeEnv('VALUE', { VALUE_B64: 'not base64!' }),
    ).toThrow('is not valid base64');
  });

  it('rejects a missing value', () => {
    expect(() => requiredSmokeEnv('VALUE', {})).toThrow('VALUE is required');
  });
});
