import { InternalServerErrorException, NotAcceptableException } from '@nestjs/common';
import { InboundEmailAddressService } from './inbound-email-address.service';

describe('InboundEmailAddressService', () => {
  const originalDomain = process.env.MAILGUN_INBOUND_DOMAIN;
  const originalSpikeRecipient = process.env.MAILGUN_INBOUND_SPIKE_RECIPIENT;
  const addressRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const businessRepo = { find: jest.fn() };
  let service: InboundEmailAddressService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAILGUN_INBOUND_DOMAIN = 'docs-dev.keepintax.co.il';
    service = new InboundEmailAddressService(addressRepo as any, businessRepo as any);
  });

  afterEach(() => {
    if (originalDomain === undefined) delete process.env.MAILGUN_INBOUND_DOMAIN;
    else process.env.MAILGUN_INBOUND_DOMAIN = originalDomain;
    if (originalSpikeRecipient === undefined) {
      delete process.env.MAILGUN_INBOUND_SPIKE_RECIPIENT;
    } else {
      process.env.MAILGUN_INBOUND_SPIKE_RECIPIENT = originalSpikeRecipient;
    }
  });

  it('returns a stable opaque address for every owned business', async () => {
    businessRepo.find.mockResolvedValue([
      { id: 1, firebaseId: 'fid', businessNumber: '123', businessName: 'עסק' },
    ]);
    addressRepo.findOne.mockResolvedValue({
      localPart: 'd-existing-token',
      firebaseId: 'fid',
      businessNumber: '123',
      isActive: true,
    });

    await expect(service.listForOwner('fid')).resolves.toEqual([
      {
        businessNumber: '123',
        businessName: 'עסק',
        address: 'd-existing-token@docs-dev.keepintax.co.il',
      },
    ]);
    expect(addressRepo.save).not.toHaveBeenCalled();
  });

  it('resolves an active recipient without exposing identity in the address', async () => {
    addressRepo.findOne.mockResolvedValue({
      localPart: 'd-opaque',
      firebaseId: 'fid',
      businessNumber: '123',
      isActive: true,
    });

    await expect(
      service.resolveRecipient('D-OPAQUE@DOCS-DEV.KEEPINTAX.CO.IL'),
    ).resolves.toEqual({ firebaseId: 'fid', businessNumber: '123' });
  });

  it('rejects unknown recipients with 406 semantics', async () => {
    addressRepo.findOne.mockResolvedValue(null);
    await expect(
      service.resolveRecipient('unknown@docs-dev.keepintax.co.il'),
    ).rejects.toBeInstanceOf(NotAcceptableException);
  });

  it('fails closed when no receiving domain is configured', async () => {
    delete process.env.MAILGUN_INBOUND_DOMAIN;
    delete process.env.MAILGUN_INBOUND_SPIKE_RECIPIENT;
    await expect(service.resolveRecipient('d-token@example.com')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
