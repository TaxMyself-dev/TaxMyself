import {
  lycheeAccountsForPhone,
  lycheeAccountHasPhone,
} from './lychee-account-lookup';

describe('Lychee saved primary and spouse phones', () => {
  it.each(['0501234567', '+972501234567', '050-1234567'])(
    'resolves %s against both columns with one bounded account query',
    async (phone) => {
      const account = {
        firebaseId: 'owner',
        phone: '0549999999',
        spousePhone: '0501234567',
      };
      const qb = {
        where: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([account]),
      };
      const users: any = { createQueryBuilder: jest.fn(() => qb) };
      expect(await lycheeAccountsForPhone(users, phone)).toEqual([account]);
      expect(qb.where.mock.calls[0][0]).toContain('u.phone');
      expect(qb.where.mock.calls[0][0]).toContain('OR');
      expect(qb.where.mock.calls[0][0]).toContain('u.spousePhone');
      expect(qb.where.mock.calls[0][1]).toEqual({
        phones: ['972501234567', '0501234567'],
      });
      expect(qb.take).toHaveBeenCalledWith(2);
    },
  );
  it('rejects invalid numbers without querying users', async () => {
    const users: any = { createQueryBuilder: jest.fn() };
    expect(await lycheeAccountsForPhone(users, 'invalid')).toEqual([]);
    expect(users.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('accepts either saved phone but not unrelated or removed spouse numbers', () => {
    expect(
      lycheeAccountHasPhone(
        { phone: '0549999999', spousePhone: '050-1234567' },
        '972501234567',
      ),
    ).toBe(true);
    expect(
      lycheeAccountHasPhone(
        { phone: '0501234567', spousePhone: null },
        '972501234567',
      ),
    ).toBe(true);
    expect(
      lycheeAccountHasPhone(
        { phone: '0549999999', spousePhone: null },
        '972501234567',
      ),
    ).toBe(false);
    expect(
      lycheeAccountHasPhone(
        { phone: '0501234567', spousePhone: '0501234567' },
        '972501234567',
      ),
    ).toBe(true);
  });
});
