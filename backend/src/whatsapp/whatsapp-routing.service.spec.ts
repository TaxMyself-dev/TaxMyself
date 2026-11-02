import { WhatsappDevelopmentConfig } from './whatsapp-development.config';
import { WhatsappRoutingService } from './whatsapp-routing.service';

describe('WhatsApp development routing', () => {
  const config = new WhatsappDevelopmentConfig();
  const routing = new WhatsappRoutingService(config);
  const original = { ...process.env };
  beforeEach(() => {
    process.env.WHATSAPP_DEV_ENABLED = 'true';
    process.env.WHATSAPP_DEV_TOKEN = 'test-token-with-at-least-24-characters';
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_DEV_CONTACTS = JSON.stringify([
      { phone: '0500000001', firebaseId: 'u1', businesses: ['b1'] },
      { phone: '0500000002', firebaseId: 'u2', businesses: ['b2', 'b3'] },
    ]);
  });
  afterAll(() => {
    process.env = original;
  });
  it.each(['0500000001', '+972500000001', '972500000001', '050-000-0001'])(
    'normalizes %s',
    (from) => {
      expect(routing.resolve(from)).toEqual({
        status: 'READY',
        firebaseId: 'u1',
        businessNumber: 'b1',
      });
    },
  );
  it('does not identify unknown numbers', () =>
    expect(routing.resolve('0500000009')).toEqual({
      status: 'UNKNOWN_SENDER',
    }));
  it('requires explicit choice with multiple businesses', () => {
    expect(routing.resolve('0500000002').status).toBe('BUSINESS_REQUIRED');
    expect(routing.resolve('0500000002', 'b3').businessNumber).toBe('b3');
  });
  it('rejects other business destinations', () =>
    expect(routing.resolve('0500000001', 'b3').status).toBe(
      'BUSINESS_NOT_ALLOWED',
    ));
  it('fails closed for duplicate bindings', () => {
    const contacts = JSON.parse(process.env.WHATSAPP_DEV_CONTACTS);
    contacts.push({ ...contacts[0], firebaseId: 'other' });
    process.env.WHATSAPP_DEV_CONTACTS = JSON.stringify(contacts);
    expect(routing.resolve('0500000001').status).toBe('AMBIGUOUS_SENDER');
  });
  it('rejects malformed sender and mappings', () => {
    expect(() => routing.resolve('500000001')).toThrow();
    process.env.WHATSAPP_DEV_CONTACTS = '{}';
    expect(() => routing.resolve('0500000001')).toThrow();
  });
  it('requires token and disables endpoints in production', () => {
    expect(() => config.authorize('wrong')).toThrow();
    expect(() =>
      config.authorize(process.env.WHATSAPP_DEV_TOKEN),
    ).not.toThrow();
    process.env.NODE_ENV = 'production';
    expect(() => config.authorize(process.env.WHATSAPP_DEV_TOKEN)).toThrow();
  });
});
