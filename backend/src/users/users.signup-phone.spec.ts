import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { ISRAELI_PHONE_MESSAGE } from '../shared/israeli-phone';

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
