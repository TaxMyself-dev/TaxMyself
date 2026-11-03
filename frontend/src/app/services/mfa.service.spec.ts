import { MfaService } from './mfa.service';

describe('MfaService phone normalization', () => {
  const service = new MfaService();

  it('normalizes an Israeli mobile number to E.164', () => {
    expect(service.normalizePhoneNumber('050-123-4567')).toBe('+972501234567');
  });

  it('keeps a valid international E.164 number', () => {
    expect(service.normalizePhoneNumber('+972 50 123 4567')).toBe('+972501234567');
  });

  it('rejects an invalid phone number', () => {
    expect(() => service.normalizePhoneNumber('1234')).toThrowError(
      'Invalid E.164 phone number',
    );
  });
});
