import type { Repository } from 'typeorm';
import type { User } from '../users/user.entity';
import { lycheeSender } from './lychee-sender';

/** Both saved profile phones authorize intake for the same account and businesses.
 * OR matches rows, not phone slots: the same phone in both fields is one account.
 * A collision across either field on distinct accounts must remain ambiguous. */
export async function lycheeAccountsForPhone(
  users: Repository<User>,
  phone: string,
): Promise<User[]> {
  const normalized = lycheeSender({ contact_phone: phone });
  if (!normalized) return [];
  const clean = (field: 'phone' | 'spousePhone') =>
    `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(u.${field}, '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')`;
  return users
    .createQueryBuilder('u')
    .where(
      `(${clean('phone')} IN (:...phones) OR ${clean(
        'spousePhone',
      )} IN (:...phones))`,
      { phones: [normalized, '0' + normalized.slice(3)] },
    )
    .take(2)
    .getMany();
}

export function lycheeAccountHasPhone(
  user: Pick<User, 'phone' | 'spousePhone'>,
  phone: string,
): boolean {
  return [user.phone, user.spousePhone].some(
    (value) => lycheeSender({ contact_phone: value }) === phone,
  );
}
