import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { ISRAELI_PHONE_MESSAGE } from '../shared/israeli-phone';
import { BusinessProprietorRole, BusinessType } from '../enum';

// The phone check runs before any repository access, so a bare context is enough.
const signup = (dto: any) => UsersService.prototype.signup.call({}, dto);

describe('UsersService.signup phone validation', () => {
  const cases: Array<[string, any]> = [
    ['personal.phone with hyphen', { personal: { phone: '050-0011223' } }],
    ['personal.phone with +972', { personal: { phone: '+972500011223' } }],
    ['spouse.spousePhone with space', { personal: {}, spouse: { spousePhone: '050 0011223' } }],
    ['business.businessPhone too short', { personal: {}, business: { businessArray: [{ businessPhone: '12345' }] } }],
  ];

  for (const [name, dto] of cases) {
    it(`rejects ${name} with the shared message`, async () => {
      await expect(signup(dto)).rejects.toThrow(new BadRequestException(ISRAELI_PHONE_MESSAGE));
    });
  }
});

describe('UsersService.signup proprietor validation', () => {
  it('requires an explicit proprietor for a private-account business', async () => {
    await expect(signup({
      personal: { isCompany: false },
      business: { businessArray: [{ businessName: 'Studio', businessType: BusinessType.EXEMPT }] },
    })).rejects.toThrow('יש לבחור בעל/ת עוסק עבור כל עסק');
  });

  it('rejects a spouse proprietor when the account has no spouse identity', async () => {
    await expect(signup({
      personal: { isCompany: false },
      spouse: {},
      business: {
        businessArray: [{
          businessName: 'Studio',
          businessType: BusinessType.EXEMPT,
          proprietorRole: BusinessProprietorRole.SPOUSE,
        }],
      },
    })).rejects.toThrow('לא ניתן לשייך עסק לבן/בת זוג ללא פרטי בן/בת זוג');
  });

  it('continues rejecting partnership types for private accounts', async () => {
    await expect(signup({
      personal: { isCompany: false },
      business: {
        businessArray: [{
          businessName: 'Partnership',
          businessType: BusinessType.AUTHORIZED_PARTNERSHIP,
          proprietorRole: BusinessProprietorRole.PRIMARY,
        }],
      },
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
