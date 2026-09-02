import {
  ConflictException,
  InternalServerErrorException,
  NotAcceptableException,
} from '@nestjs/common';
import { InboundEmailAddressService } from './inbound-email-address.service';

describe('InboundEmailAddressService', () => {
  const originalDomain = process.env.MAILGUN_INBOUND_DOMAIN;
  const originalSpikeRecipient = process.env.MAILGUN_INBOUND_SPIKE_RECIPIENT;
  const addressRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const businessRepo = { find: jest.fn(), findOne: jest.fn() };
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

  it('returns an existing address and flags the legacy generated format', async () => {
    businessRepo.find.mockResolvedValue([
      { id: 1, firebaseId: 'fid', businessNumber: '123', businessName: 'עסק' },
    ]);
    addressRepo.findOne.mockResolvedValue({
      localPart: 'd-0123456789abcdef01234567',
      firebaseId: 'fid',
      businessNumber: '123',
      isActive: true,
    });

    await expect(service.listForOwner('fid')).resolves.toEqual([
      {
        businessNumber: '123',
        businessName: 'עסק',
        domain: 'docs-dev.keepintax.co.il',
        address: 'd-0123456789abcdef01234567@docs-dev.keepintax.co.il',
        localPart: 'd-0123456789abcdef01234567',
        suggestedLocalPart: '',
        isLegacyGenerated: true,
      },
    ]);
    expect(addressRepo.save).not.toHaveBeenCalled();
  });

  it('automatically claims an available ASCII business-name alias', async () => {
    businessRepo.find.mockResolvedValue([{
      id: 1,
      firebaseId: 'fid',
      businessNumber: '123',
      businessName: 'Porto Pivo Ltd.',
    }]);
    addressRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    addressRepo.save.mockImplementation(async value => ({ id: 9, ...value }));

    await expect(service.listForOwner('fid')).resolves.toEqual([
      expect.objectContaining({
        address: 'porto-pivo-ltd@docs-dev.keepintax.co.il',
        localPart: 'porto-pivo-ltd',
        suggestedLocalPart: 'porto-pivo-ltd',
        isLegacyGenerated: false,
      }),
    ]);
  });

  it('leaves selection to the user when the suggested business name is taken', async () => {
    businessRepo.find.mockResolvedValue([{
      id: 1,
      firebaseId: 'fid',
      businessNumber: '123',
      businessName: 'Same Name',
    }]);
    addressRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 77, localPart: 'same-name' });

    await expect(service.listForOwner('fid')).resolves.toEqual([
      expect.objectContaining({
        address: null,
        localPart: null,
        suggestedLocalPart: 'same-name',
      }),
    ]);
    expect(addressRepo.save).not.toHaveBeenCalled();
  });

  it('lets the owner replace a legacy address with a friendly unique alias', async () => {
    const business = {
      id: 1,
      firebaseId: 'fid',
      businessNumber: '123',
      businessName: 'Porto Pivo',
    };
    const mailbox = {
      id: 8,
      localPart: 'd-0123456789abcdef01234567',
      firebaseId: 'fid',
      businessNumber: '123',
      isActive: true,
    };
    businessRepo.findOne.mockResolvedValue(business);
    addressRepo.findOne
      .mockResolvedValueOnce(mailbox)
      .mockResolvedValueOnce(null);
    addressRepo.save.mockImplementation(async value => value);

    await expect(
      service.updateForOwner('fid', '123', 'porto-pivo'),
    ).resolves.toEqual(expect.objectContaining({
      address: 'porto-pivo@docs-dev.keepintax.co.il',
      localPart: 'porto-pivo',
      isLegacyGenerated: false,
    }));
  });

  it('rejects an alias already owned by another business', async () => {
    businessRepo.findOne.mockResolvedValue({
      firebaseId: 'fid',
      businessNumber: '123',
      businessName: 'Business',
    });
    addressRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 88, localPart: 'taken-name' });

    await expect(
      service.updateForOwner('fid', '123', 'taken-name'),
    ).rejects.toBeInstanceOf(ConflictException);
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
