import { EmailRoutingService } from './email-routing.service';
import { Business } from '../business/business.entity';
function fixture(
  businesses = [
    { businessNumber: '123456789' },
    { businessNumber: '987654321' },
  ],
) {
  const integration: any = {
    id: 17,
    firebaseId: 'owner',
    provider: 'GOOGLE',
    status: 'ACTIVE',
    emailRouting: { businessNumber: '123456789', rules: [] },
  };
  const accounts = {
    findOneBy: jest.fn(async () => integration),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const businessRepo = { find: jest.fn(async () => businesses) };
  const db: any = {
    getRepository: (entity: any) =>
      entity === Business ? businessRepo : accounts,
  };
  return {
    service: new EmailRoutingService(db),
    integration,
    accounts,
    businesses,
  };
}
describe('owned mailbox settings and initial routing', () => {
  it('auto-selects a sole owned business but requires a valid choice for multiple businesses',async()=>{
    const single=fixture([{businessNumber:'123456789'}]);
    expect(await single.service.connectionBusiness('owner')).toBe('123456789');
    await expect(single.service.connectionBusiness('owner','foreign')).rejects.toThrow();
    const multi=fixture();await expect(multi.service.connectionBusiness('owner')).rejects.toThrow();
    expect(await multi.service.connectionBusiness('owner','987654321')).toBe('987654321');
  });
  it('prefers sender rule over mailbox and validates all destinations', async () => {
    const t = fixture();
    t.integration.emailRouting.rules = [
      {
        sender: 'a@example.com',
        action: 'BUSINESS',
        businessNumber: '987654321',
      },
    ];
    expect(
      await t.service.initial('owner', 17, 'A <a@example.com>'),
    ).toMatchObject({ initialBusiness: '987654321', source: 'SENDER_RULE' });
    expect(
      await t.service.initial('owner', 17, 'other@example.com'),
    ).toMatchObject({ initialBusiness: '123456789', source: 'MAILBOX' });
    await expect(
      t.service.save('owner', 17, {
        businessNumber: '123456789',
        rules: [
          {
            sender: 'a@example.com',
            action: 'BUSINESS',
            businessNumber: 'foreign',
          },
        ],
      }),
    ).rejects.toThrow('does not belong');
    expect(t.accounts.update).not.toHaveBeenCalled();
    expect(t.accounts.findOneBy).toHaveBeenCalledWith({
      id: 17,
      firebaseId: 'owner',
    });
  });
  it('requires explicit mailbox default for multiple businesses, and handles a sole business', async () => {
    const t = fixture();
    t.integration.emailRouting = null;
    await expect(t.service.initial('owner', 17)).rejects.toThrow('ברירת מחדל');
    const single = fixture([{ businessNumber: '123456789' }]);
    single.integration.emailRouting = null;
    expect(await single.service.initial('owner', 17)).toMatchObject({
      initialBusiness: '123456789',
      source: 'SINGLE_BUSINESS',
    });
  });
  it('retains block precedence even for a sole business', async () => {
    const t = fixture([{ businessNumber: '123456789' }]);
    t.integration.emailRouting.rules = [
      { sender: 'a@example.com', action: 'BLOCK' },
    ];
    await expect(
      t.service.initial('owner', 17, 'a@example.com'),
    ).rejects.toThrow('EMAIL_SENDER_BLOCKED');
  });
  it('fails closed for revoked, foreign and missing mailboxes', async () => {
    const t = fixture();
    t.accounts.findOneBy.mockResolvedValue(null);
    await expect(t.service.save('owner', 17, { rules: [] })).rejects.toThrow(
      'Mailbox not found',
    );
    expect(t.accounts.update).not.toHaveBeenCalled();
  });
});
