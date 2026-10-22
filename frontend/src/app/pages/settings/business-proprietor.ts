import { IUserData, ISelectItem } from 'src/app/shared/interface';
import { BusinessProprietorRole } from 'src/app/shared/enums';

export function getBusinessProprietorOptions(
  user: IUserData | null | undefined,
): ISelectItem[] {
  const primaryName = [user?.fName, user?.lName].filter(Boolean).join(' ').trim();
  const options: ISelectItem[] = [{
    value: BusinessProprietorRole.PRIMARY,
    name: primaryName ? `${primaryName} — משתמש/ת ראשי/ת` : 'משתמש/ת ראשי/ת',
  }];

  if (user?.spouseId) {
    const spouseName = [user.spouseFName, user.spouseLName].filter(Boolean).join(' ').trim();
    options.push({
      value: BusinessProprietorRole.SPOUSE,
      name: spouseName ? `${spouseName} — בן/בת הזוג` : 'בן/בת הזוג',
    });
  }

  return options;
}
