import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ISRAELI_PHONE_MESSAGE, isValidIsraeliPhone } from './israeli-phone';
import { CreateClientDto } from '../clients/create-client.dto';
import { UpdateClientDto } from '../clients/update-client.dto';
import { CreateBusinessDto } from '../business/dtos/create-business.dto';
import { UpdateBusinessDto } from '../business/dtos/update-business.dto';
import { UpdateUserDto } from '../users/dtos/update-user.dto';
import { CreateClientByAccountantDto } from '../delegation/dtos/create-client-by-accountant.dto';
import { DocDataDto } from '../documents/dtos/doc-data.dto';

const GOOD = ['021234567', '031234567', '041234567', '081234567', '091234567', '0501234567', '0521234567', '0721234567', '0768053548'];
const BAD = ['05012345', '050123456', '05012345678', '0212345678', '01234567', '061234567', '050-1234567',
  '050 1234567', '050123456a', '+972501234567', ' 0501234567', '0501234567 ', '1800123456', '*2345'];

describe('Israeli phone validation', () => {
  it('shared predicate accepts valid numbers and empty values only', () => {
    for (const p of GOOD) expect(isValidIsraeliPhone(p)).toBe(true);
    for (const p of ['', null, undefined]) expect(isValidIsraeliPhone(p)).toBe(true);
    for (const p of BAD) expect(isValidIsraeliPhone(p)).toBe(false);
    expect(isValidIsraeliPhone(501234567)).toBe(false);
  });

  const phoneErrors = async (cls: any, field: string, value: unknown, extra: object = {}) => {
    const errors = await validate(plainToInstance(cls, { ...extra, [field]: value }) as object);
    return errors.filter((e) => e.property === field);
  };

  const optionalCases: Array<[string, any, string, object]> = [
    ['CreateClientDto', CreateClientDto, 'phone', { name: 'x', businessNumber: '1' }],
    ['UpdateClientDto', UpdateClientDto, 'phone', {}],
    ['CreateBusinessDto', CreateBusinessDto, 'businessPhone', {}],
    ['UpdateBusinessDto', UpdateBusinessDto, 'businessPhone', {}],
    ['UpdateUserDto phone', UpdateUserDto, 'phone', {}],
    ['UpdateUserDto spousePhone', UpdateUserDto, 'spousePhone', {}],
    ['DocDataDto recipientPhone', DocDataDto, 'recipientPhone', {}],
  ];

  for (const [name, cls, field, extra] of optionalCases) {
    it(`${name}: optional field accepts valid/empty, rejects invalid with the shared message`, async () => {
      for (const p of [...GOOD, '', undefined]) expect(await phoneErrors(cls, field, p, extra)).toHaveLength(0);
      for (const p of BAD) {
        const errs = await phoneErrors(cls, field, p, extra);
        expect(errs).toHaveLength(1);
        expect(Object.values(errs[0].constraints ?? {})).toContain(ISRAELI_PHONE_MESSAGE);
      }
    });
  }

  it('CreateClientByAccountantDto: phone stays required and must be valid', async () => {
    const base = { email: 'a@b.co' };
    expect(await phoneErrors(CreateClientByAccountantDto, 'phone', '', base)).toHaveLength(1);
    expect(await phoneErrors(CreateClientByAccountantDto, 'phone', undefined, base)).toHaveLength(1);
    for (const p of GOOD) expect(await phoneErrors(CreateClientByAccountantDto, 'phone', p, base)).toHaveLength(0);
    for (const p of BAD) expect(await phoneErrors(CreateClientByAccountantDto, 'phone', p, base)).toHaveLength(1);
  });
});
