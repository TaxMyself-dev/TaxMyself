import { BusinessProprietorRole } from 'src/app/shared/enums';
import { IUserData } from 'src/app/shared/interface';
import { getBusinessProprietorOptions } from './business-proprietor';

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
    expect(options[1].name).toContain('Noam Levi');
  });

  it('does not offer a spouse when no spouse identity exists', () => {
    expect(getBusinessProprietorOptions({ fName: 'Dana' } as IUserData)).toEqual([
      { value: BusinessProprietorRole.PRIMARY, name: 'Dana — משתמש/ת ראשי/ת' },
    ]);
  });
});
