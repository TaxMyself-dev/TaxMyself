import {
  applySenderExclusions,
  evaluateSender,
  resolveAiBusiness,
  routingSettings,
  senderAddress,
} from './email-routing.policy';
describe('email business routing policy', () => {
  const businesses = [
    { businessNumber: '123456789' },
    { businessNumber: '987654321' },
  ];
  it('matches the actual mailbox, never a display name or substring', () => {
    expect(senderAddress('"Accounts" <Billing@Example.com>')).toBe(
      'billing@example.com',
    );
    expect(senderAddress('billing@example.com.evil.invalid')).not.toBe(
      'billing@example.com',
    );
    expect(senderAddress('Accounts')).toBeNull();
  });
  it('evaluates all rules and lets a block win over any assignment', () => {
    const settings = routingSettings({
      businessNumber: '123456789',
      rules: [
        {
          sender: 'billing@example.com',
          action: 'BUSINESS',
          businessNumber: '987654321',
        },
        { sender: 'other@example.com', action: 'BLOCK' },
        { sender: 'billing@example.com', action: 'BLOCK' },
      ],
    });
    expect(
      evaluateSender(settings, 'Billing <BILLING@example.com>').blocked,
    ).toBe(true);
    expect(applySenderExclusions('has:attachment', settings)).toBe(
      'has:attachment -from:(billing@example.com) -from:(other@example.com)',
    );
    expect(
      applySenderExclusions(
        'has:attachment -from:(user-filter@example.com)',
        routingSettings(null),
      ),
    ).toBe('has:attachment -from:(user-filter@example.com)');
  });
  it('rejects conflicting assignments and malformed or excessive rules', () => {
    expect(() =>
      routingSettings({
        rules: [
          { sender: 'a@example.com', action: 'BUSINESS', businessNumber: '1' },
          { sender: 'a@example.com', action: 'BUSINESS', businessNumber: '2' },
        ],
      }),
    ).toThrow('CONFLICTING');
    expect(() =>
      routingSettings({
        rules: [{ sender: 'Name <a@example.com>', action: 'BLOCK' }],
      }),
    ).toThrow();
    expect(() =>
      routingSettings({
        rules: new Array(101).fill({
          sender: 'a@example.com',
          action: 'BLOCK',
        }),
      }),
    ).toThrow();
  });
  it('uses only exact, unambiguous buyer tax identity in the owned business set', () => {
    expect(
      resolveAiBusiness(
        [{ supplier_id: '987654321', recipient_name: 'Other' }],
        businesses,
      ),
    ).toBeNull();
    expect(
      resolveAiBusiness([{ recipient_tax_id: '987-654-321' }], businesses)
        ?.businessNumber,
    ).toBe('987654321');
    expect(
      resolveAiBusiness([{ recipient_tax_id: '111111111' }], businesses),
    ).toBeNull();
    expect(
      resolveAiBusiness(
        [{ recipient_tax_id: '123456789' }, { recipient_tax_id: '987654321' }],
        businesses,
      ),
    ).toBeNull();
    expect(
      resolveAiBusiness([{ recipient_tax_id: 987654321 }], businesses),
    ).toBeNull();
  });
});
