import { BusinessProprietorRole } from 'src/app/shared/enums';
import { IUserData } from 'src/app/shared/interface';
import {
  getBusinessNumberForProprietor,
  getBusinessProprietorOptions,
} from './business-proprietor';

describe('business proprietor options', () => {
  it('offers the primary user and an existing spouse', () => {
    const options = getBusinessProprietorOptions({
      fName: 'Dana',
      lName: 'Levi',
      spouseFName: 'Noam',
      spouseLName: 'Levi',
      spouseId: '123456789',
    } as IUserData);

    expect(options.map((option) => option.value)).toEqual([
      BusinessProprietorRole.PRIMARY,
      BusinessProprietorRole.SPOUSE,
    ]);
    expect(options.map((option) => option.name)).toEqual([
      'Dana Levi',
      'Noam Levi',
    ]);
  });

  it('does not offer a spouse when no spouse identity exists', () => {
    expect(getBusinessProprietorOptions({ fName: 'Dana' } as IUserData)).toEqual([
      { value: BusinessProprietorRole.PRIMARY, name: 'Dana' },
    ]);
  });

  it('uses a neutral fallback instead of an account-role label', () => {
    expect(getBusinessProprietorOptions({ spouseId: '123456789' } as IUserData)).toEqual([
      { value: BusinessProprietorRole.PRIMARY, name: 'שם חסר' },
      { value: BusinessProprietorRole.SPOUSE, name: 'שם חסר' },
    ]);
  });

  it('maps each proprietor to the matching identity number', () => {
    const user = {
      id: ' 111111111 ',
      spouseId: ' 222222222 ',
    } as IUserData;

    expect(getBusinessNumberForProprietor(user, BusinessProprietorRole.PRIMARY))
      .toBe('111111111');
    expect(getBusinessNumberForProprietor(user, BusinessProprietorRole.SPOUSE))
      .toBe('222222222');
  });

  it('returns an empty business number when the selected identity is missing', () => {
    expect(getBusinessNumberForProprietor(null, BusinessProprietorRole.PRIMARY)).toBe('');
    expect(getBusinessNumberForProprietor({} as IUserData, BusinessProprietorRole.SPOUSE)).toBe('');
  });
});
