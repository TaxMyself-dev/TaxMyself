import { IUserData, ISelectItem } from 'src/app/shared/interface';
import { BusinessProprietorRole } from 'src/app/shared/enums';

export function getBusinessNumberForProprietor(
  user: IUserData | null | undefined,
  proprietorRole: BusinessProprietorRole,
): string {
  const businessNumber = proprietorRole === BusinessProprietorRole.SPOUSE
    ? user?.spouseId
    : user?.id;

  return businessNumber?.trim() ?? '';
}

export function getBusinessProprietorOptions(
  user: IUserData | null | undefined,
): ISelectItem[] {
  const fullName = (...parts: Array<string | null | undefined>) =>
    parts.map((part) => part?.trim()).filter(Boolean).join(' ');
  const primaryName = fullName(user?.fName, user?.lName);
  const options: ISelectItem[] = [{
    value: BusinessProprietorRole.PRIMARY,
    name: primaryName || 'שם חסר',
  }];

  if (user?.spouseId) {
    const spouseName = fullName(user.spouseFName, user.spouseLName);
    options.push({
      value: BusinessProprietorRole.SPOUSE,
      name: spouseName || 'שם חסר',
    });
  }

  return options;
}
