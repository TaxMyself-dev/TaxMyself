import { FIELD_MAP } from '../enum';
import {
  assertValidUniformFileContents,
  UniformFileValidationError,
  validateUniformFileContents,
} from './uniform-file-validator';

const RECORD_LENGTHS = {
  A000: 466,
  A100: 95,
  Z900: 110,
  C100: 444,
  D110: 339,
  D120: 222,
  B100: 317,
  B110: 376,
  M100: 298,
} as const;

function validFixture() {
  const businessNumber = '123456789';
  const uniqueId = '123456789012345';
  const dataRecords = [
    `A100000000001${businessNumber}${uniqueId}&OF1.31&${'!'.repeat(50)}`,
    `Z900000000002${businessNumber}${uniqueId}&OF1.31&${String(2).padStart(15, '0')}${'?'.repeat(50)}`,
  ];
  const a000Prefix = `A000${'!'.repeat(5)}${String(dataRecords.length).padStart(15, '0')}`
    + `${businessNumber}${uniqueId}&OF1.31&`;
  const iniRecords = [
    a000Prefix + '!'.repeat(RECORD_LENGTHS.A000 - a000Prefix.length),
    ...['C100', 'D110', 'D120', 'B100', 'B110', 'M100'].map(
      (code) => `${code}${String(0).padStart(15, '0')}`,
    ),
  ];
  return {
    ini: iniRecords.join('\r\n') + '\r\n',
    data: dataRecords.join('\r\n') + '\r\n',
  };
}

function buildRecord(
  code: keyof typeof FIELD_MAP,
  values: Record<string, string>,
): string {
  return FIELD_MAP[code].map(({ field, length }) => {
    const value = values[field] ?? (field === FIELD_MAP[code][0].field ? code : '!');
    return value.padEnd(length, '!').slice(0, length);
  }).join('');
}

function fixtureWithLedger(accountInMovement: string, accountInChart: string) {
  const businessNumber = '123456789';
  const uniqueId = '123456789012345';
  const zeroAmount = (length: number) => `+${'0'.repeat(length - 1)}`;
  const dataRecords = [
    buildRecord('A100', {
      f_1100: 'A100', f_1101: '000000001', f_1102: businessNumber,
      f_1103: uniqueId, f_1104: '&OF1.31&',
    }),
    buildRecord('B100', {
      f_1350: 'B100', f_1351: '000000002', f_1352: businessNumber,
      f_1364: accountInMovement, f_1366: '1',
      f_1368: zeroAmount(15), f_1369: zeroAmount(15), f_1370: zeroAmount(12),
    }),
    buildRecord('B110', {
      f_1400: 'B110', f_1401: '000000003', f_1402: businessNumber,
      f_1403: accountInChart, f_1414: zeroAmount(15), f_1415: zeroAmount(15),
      f_1416: zeroAmount(15), f_1422: zeroAmount(15),
    }),
    buildRecord('Z900', {
      f_1150: 'Z900', f_1151: '000000004', f_1152: businessNumber,
      f_1153: uniqueId, f_1154: '&OF1.31&', f_1155: String(4).padStart(15, '0'),
    }),
  ];
  const a000Prefix = `A000${'!'.repeat(5)}${String(4).padStart(15, '0')}`
    + `${businessNumber}${uniqueId}&OF1.31&`;
  const counts: Record<string, number> = { B100: 1, B110: 1 };
  const iniRecords = [
    a000Prefix + '!'.repeat(RECORD_LENGTHS.A000 - a000Prefix.length),
    ...['C100', 'D110', 'D120', 'B100', 'B110', 'M100'].map(
      (code) => `${code}${String(counts[code] ?? 0).padStart(15, '0')}`,
    ),
  ];
  return {
    ini: iniRecords.join('\r\n') + '\r\n',
    data: dataRecords.join('\r\n') + '\r\n',
  };
}

const signedAmount = (amount: number, length = 15): string => {
  const cents = Math.round(Math.abs(amount) * 100);
  return `${amount < 0 ? '-' : '+'}${String(cents).padStart(length - 1, '0')}`;
};

function fixtureWithDocumentDetails(options: {
  includeLine: boolean;
  includePayment: boolean;
  lineAmount?: number;
  paymentAmount?: number;
}) {
  const businessNumber = '123456789';
  const uniqueId = '123456789012345';
  const documentNumber = '00000000000000000042';
  const dataRecords = [
    buildRecord('A100', {
      f_1100: 'A100', f_1101: '000000001', f_1102: businessNumber,
      f_1103: uniqueId, f_1104: '&OF1.31&',
    }),
    buildRecord('C100', {
      f_1200: 'C100', f_1201: '000000002', f_1202: businessNumber,
      f_1203: '320', f_1204: documentNumber,
      f_1217: signedAmount(0), f_1219: signedAmount(100),
      f_1220: signedAmount(0), f_1221: signedAmount(100),
      f_1222: signedAmount(18), f_1223: signedAmount(118),
      f_1224: signedAmount(0, 12),
    }),
  ];
  if (options.includeLine) {
    dataRecords.push(buildRecord('D110', {
      f_1250: 'D110', f_1251: String(dataRecords.length + 1).padStart(9, '0'),
      f_1252: businessNumber, f_1253: '320', f_1254: documentNumber,
      f_1264: signedAmount(1, 17), f_1265: signedAmount(100),
      f_1266: signedAmount(0), f_1267: signedAmount(options.lineAmount ?? 100),
    }));
  }
  if (options.includePayment) {
    dataRecords.push(buildRecord('D120', {
      f_1300: 'D120', f_1301: String(dataRecords.length + 1).padStart(9, '0'),
      f_1302: businessNumber, f_1303: '320', f_1304: documentNumber,
      f_1312: signedAmount(options.paymentAmount ?? 118),
    }));
  }
  const total = dataRecords.length + 1;
  dataRecords.push(buildRecord('Z900', {
    f_1150: 'Z900', f_1151: String(total).padStart(9, '0'), f_1152: businessNumber,
    f_1153: uniqueId, f_1154: '&OF1.31&', f_1155: String(total).padStart(15, '0'),
  }));
  const a000Prefix = `A000${'!'.repeat(5)}${String(total).padStart(15, '0')}`
    + `${businessNumber}${uniqueId}&OF1.31&`;
  const counts: Record<string, number> = {
    C100: 1,
    D110: options.includeLine ? 1 : 0,
    D120: options.includePayment ? 1 : 0,
  };
  const iniRecords = [
    a000Prefix + '!'.repeat(RECORD_LENGTHS.A000 - a000Prefix.length),
    ...['C100', 'D110', 'D120', 'B100', 'B110', 'M100'].map(
      (code) => `${code}${String(counts[code] ?? 0).padStart(15, '0')}`,
    ),
  ];
  return {
    ini: iniRecords.join('\r\n') + '\r\n',
    data: dataRecords.join('\r\n') + '\r\n',
  };
}

describe('uniform-file 1.31 validator', () => {
  it('keeps every emitted field map aligned with the official record length', () => {
    for (const [code, expected] of Object.entries(RECORD_LENGTHS)) {
      const actual = FIELD_MAP[code as keyof typeof FIELD_MAP]
        .reduce((sum, field) => sum + field.length, 0);
      expect(actual).toBe(expected);
    }
  });

  it('accepts a structurally valid 1.31 INI and BKMVDATA pair', () => {
    const fixture = validFixture();
    expect(validateUniformFileContents(fixture.ini, fixture.data)).toEqual([]);
    expect(() => assertValidUniformFileContents(fixture.ini, fixture.data)).not.toThrow();
  });

  it('reports byte length, line-ending, sequence, and summary mismatches together', () => {
    const fixture = validFixture();
    const malformedData = fixture.data
      .replace('A100000000001', 'A100000000009')
      .replace(/\r\n$/, '\n')
      .replace(/\?{50}/, '?'.repeat(48));
    const malformedIni = fixture.ini.replace('B110000000000000000', 'B110000000000000001');

    const issues = validateUniformFileContents(malformedIni, malformedData);
    const messages = issues.map((issue) => issue.message).join('\n');

    expect(messages).toContain('non-CRLF line ending');
    expect(messages).toContain('(Z900) is 109 bytes; expected 110');
    expect(messages).toContain('record number 000000009; expected 000000001');
    expect(messages).toContain('INI summary B110 is 1; expected 0');
    expect(() => assertValidUniformFileContents(malformedIni, malformedData))
      .toThrow(UniformFileValidationError);
  });

  it('rejects identifiers that are inconsistent across the paired files', () => {
    const fixture = validFixture();
    const malformedData = fixture.data.replace(
      'A100000000001123456789',
      'A100000000001987654321',
    );

    expect(validateUniformFileContents(fixture.ini, malformedData)
      .map((issue) => issue.message))
      .toContain('A100 business number does not match A000');
  });

  it('rejects a B100 account without a matching B110 chart record', () => {
    const fixture = fixtureWithLedger('40000', '50000');

    expect(validateUniformFileContents(fixture.ini, fixture.data)
      .map((issue) => issue.message))
      .toContain('B100 account 40000 has no matching B110 record');
  });

  it('accepts a ledger movement whose account exists in B110', () => {
    const fixture = fixtureWithLedger('40000', '40000');

    expect(validateUniformFileContents(fixture.ini, fixture.data)).toEqual([]);
  });

  it('rejects a C100 document whose required detail records are missing', () => {
    const fixture = fixtureWithDocumentDetails({ includeLine: false, includePayment: false });
    const messages = validateUniformFileContents(fixture.ini, fixture.data)
      .map((issue) => issue.message);

    expect(messages).toContain(
      'C100 document type 320 number 00000000000000000042 has no matching D110 record',
    );
    expect(messages).toContain(
      'C100 document type 320 number 00000000000000000042 has no matching D120 record',
    );
  });

  it('rejects document-detail and payment totals that do not match C100', () => {
    const fixture = fixtureWithDocumentDetails({
      includeLine: true, includePayment: true, lineAmount: 90, paymentAmount: 100,
    });
    const messages = validateUniformFileContents(fixture.ini, fixture.data)
      .map((issue) => issue.message);

    expect(messages).toContain(
      'C100 document type 320 number 00000000000000000042 amount 1219 does not match D110 amount 1267',
    );
    expect(messages).toContain(
      'C100 document type 320 number 00000000000000000042 amount 1223 does not match D120 amount 1312',
    );
  });

  it('accepts matching C100, D110, and D120 records', () => {
    const fixture = fixtureWithDocumentDetails({ includeLine: true, includePayment: true });
    expect(validateUniformFileContents(fixture.ini, fixture.data)).toEqual([]);
  });
});
