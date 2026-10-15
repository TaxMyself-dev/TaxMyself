import AdmZip = require('adm-zip');
import * as iconv from 'iconv-lite';
import { Between } from 'typeorm';
import { FIELD_MAP, PaymentMethodType } from '../enum';
import { ReportsService } from './reports.service';

type ReportsServiceHarness = {
  documentsRepo: { find: jest.Mock };
  JournalEntryRepo: { find: jest.Mock };
  JournalLineRepo: { find: jest.Mock; createQueryBuilder: jest.Mock };
  sharedService: { convertStringToDateObject: jest.Mock };
  catalogContextService: { forUser: jest.Mock };
  catalogService: { getEffectiveAccounts: jest.Mock };
  generateUniqueId: jest.Mock;
  getCurrentTimestamp: jest.Mock;
  generateDataFileContent: jest.Mock;
  generateIniFileContent: jest.Mock;
  buildUniformSummaries: jest.Mock;
  fetchDocuments: jest.Mock;
  fetchJournalEntries: jest.Mock;
  generateC100Section: jest.Mock;
  generateD110Section: jest.Mock;
  generateD120Section: jest.Mock;
  generateB100Section: jest.Mock;
  generateB110Section: jest.Mock;
  generateM100Section: jest.Mock;
  createUniformFile: ReportsService['createUniformFile'];
  generateA100Section: (businessNumber: string, uniqueId: string, state: any) => string;
  generateZ900Section: (businessNumber: string, uniqueId: string, state: any) => string;
};

const initialSummary = () => ({
  A100: 1,
  B100: 0,
  B110: 0,
  C100: 0,
  D110: 0,
  D120: 0,
  M100: 0,
  Z900: 1,
});

function createBalanceQueryBuilder(rows: Array<Record<string, string>> = []) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
}

function createHarness(): ReportsServiceHarness {
  const service = Object.create(ReportsService.prototype) as ReportsServiceHarness;
  service.documentsRepo = { find: jest.fn() };
  service.JournalEntryRepo = { find: jest.fn() };
  service.JournalLineRepo = {
    find: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(createBalanceQueryBuilder()),
  };
  service.sharedService = {
    convertStringToDateObject: jest.fn((value: string) => new Date(`${value}T00:00:00`)),
  };
  service.catalogContextService = { forUser: jest.fn() };
  service.catalogService = { getEffectiveAccounts: jest.fn() };
  return service;
}

function createGenerationState() {
  return { recordCounter: 1, recordSummary: initialSummary(), totalLists: 2 };
}

function stubEmptyDataSections(service: ReportsServiceHarness) {
  service.fetchDocuments = jest.fn().mockResolvedValue([]);
  service.fetchJournalEntries = jest.fn().mockResolvedValue([]);
  service.generateC100Section = jest.fn().mockResolvedValue('');
  service.generateD110Section = jest.fn().mockResolvedValue('');
  service.generateD120Section = jest.fn().mockResolvedValue('');
  service.generateB100Section = jest.fn().mockResolvedValue('');
  service.generateB110Section = jest.fn().mockResolvedValue('');
  service.generateM100Section = jest.fn().mockResolvedValue('');
}

function validC100Record(state: { recordCounter: number }, businessNumber: string): string {
  const values: Record<string, string> = {
    f_1200: 'C100',
    f_1201: String(state.recordCounter++).padStart(9, '0'),
    f_1202: businessNumber,
  };
  for (const field of ['f_1217', 'f_1219', 'f_1220', 'f_1221', 'f_1222', 'f_1223']) {
    values[field] = `+${'0'.repeat(14)}`;
  }
  values.f_1224 = `+${'0'.repeat(11)}`;
  return FIELD_MAP.C100.map(({ field, length }) =>
    (values[field] ?? '!').padEnd(length, '!').slice(0, length),
  ).join('') + '\r\n';
}

describe('ReportsService uniform-file characterization', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('packages the current INI and BKMVDATA payloads under the OPENFRMT path in Windows-1255', async () => {
    const service = createHarness();
    const a000Prefix = `A000${'!'.repeat(5)}${String(2).padStart(15, '0')}`
      + '123456789123456789012345&OF1.31&';
    const iniContent = [
      a000Prefix + '!'.repeat(466 - a000Prefix.length),
      ...['C100', 'D110', 'D120', 'B100', 'B110', 'M100'].map(
        (code) => `${code}${String(0).padStart(15, '0')}`,
      ),
    ].join('\r\n') + '\r\n';
    const bkmContent = [
      `A100000000001123456789123456789012345&OF1.31&${'בדיקה'.padEnd(50, '!')}`,
      `Z900000000002123456789123456789012345&OF1.31&${String(2).padStart(15, '0')}${'?'.repeat(50)}`,
    ].join('\r\n') + '\r\n';
    const yearSuffix = String(new Date().getFullYear()).slice(-2);

    service.generateUniqueId = jest.fn().mockReturnValue('123456789012345');
    service.getCurrentTimestamp = jest.fn().mockReturnValue('10120930');
    service.generateDataFileContent = jest.fn().mockResolvedValue({
      content: bkmContent,
      summary: [],
    });
    service.generateIniFileContent = jest.fn().mockResolvedValue(iniContent);
    service.buildUniformSummaries = jest.fn().mockResolvedValue({
      document_summary: [],
      list_summary: [],
    });

    const result = await service.createUniformFile(
      'firebase-user',
      '2026-01-01',
      '2026-12-31',
      '123456789',
    );

    expect(result.filePath).toBe(`OPENFRMT/12345678.${yearSuffix}/10120930`);
    const zip = new AdmZip(result.zipBuffer);
    const entries = zip.getEntries().map((entry) => entry.entryName).sort();
    expect(entries).toEqual([
      `OPENFRMT/12345678.${yearSuffix}/10120930/BKMVDATA.TXT`,
      `OPENFRMT/12345678.${yearSuffix}/10120930/INI.TXT`,
    ]);
    expect(
      iconv.decode(
        zip.readFile(`OPENFRMT/12345678.${yearSuffix}/10120930/INI.TXT`)!,
        'windows-1255',
      ),
    ).toBe(iniContent);
    expect(
      iconv.decode(
        zip.readFile(`OPENFRMT/12345678.${yearSuffix}/10120930/BKMVDATA.TXT`)!,
        'windows-1255',
      ),
    ).toBe(bkmContent);
    expect(result.iniBuffer).toEqual(iconv.encode(iniContent, 'windows-1255'));
    expect(result.bkmvdataBuffer).toEqual(iconv.encode(bkmContent, 'windows-1255'));
    expect(zip.readFile(`OPENFRMT/12345678.${yearSuffix}/10120930/INI.TXT`)).toEqual(
      result.iniBuffer,
    );
    expect(zip.readFile(`OPENFRMT/12345678.${yearSuffix}/10120930/BKMVDATA.TXT`)).toEqual(
      result.bkmvdataBuffer,
    );
    expect(service.generateDataFileContent).toHaveBeenCalledWith(
      'firebase-user',
      '123456789',
      '2026-01-01',
      '2026-12-31',
      '123456789012345',
      expect.objectContaining({ recordCounter: 1, recordSummary: initialSummary(), totalLists: 0 }),
    );
  });

  it('emits fixed-width A100 and Z900 records with CRLF terminators', () => {
    const service = createHarness();
    const state = createGenerationState();

    const opening = service.generateA100Section('123456789', '123456789012345', state);
    const closing = service.generateZ900Section('123456789', '123456789012345', state);

    expect(opening).toHaveLength(95 + 2);
    expect(closing).toHaveLength(110 + 2);
    expect(opening).toMatch(/^A100000000001123456789123456789012345&OF1\.31&!{50}\r\n$/);
    expect(closing).toMatch(/^Z900000000002123456789123456789012345&OF1\.31&0{14}2\?{50}\r\n$/);
  });

  it('rebuilds identical INI bytes from an explicit generation timestamp', async () => {
    const service = createHarness();
    const generatedAt = new Date(2026, 9, 15, 12, 34, 56);

    const first = await (service as any).generateIniFileContent(
      '123456789',
      '123456789012345',
      '12345678.26/10151234',
      '2026-01-01',
      '2026-12-31',
      createGenerationState(),
      generatedAt,
    );
    const second = await (service as any).generateIniFileContent(
      '123456789',
      '123456789012345',
      '12345678.26/10151234',
      '2026-01-01',
      '2026-12-31',
      createGenerationState(),
      generatedAt,
    );

    expect(Buffer.from(first)).toEqual(Buffer.from(second));
    expect(first).toContain('20261015');
    expect(first).toContain('1234');
  });

  it('scopes document reads to the requested business and document-date period', async () => {
    const service = createHarness();
    service.documentsRepo.find.mockResolvedValue([]);

    await service.fetchDocuments('123456789', '2026-01-01', '2026-12-31');

    expect(service.documentsRepo.find).toHaveBeenCalledWith({
      where: {
        issuerBusinessNumber: '123456789',
        docDate: Between(new Date('2026-01-01T00:00:00'), new Date('2026-12-31T00:00:00')),
      },
      order: { docDate: 'ASC' },
    });
  });

  it('scopes journal reads to the requested business and accounting period', async () => {
    const service = createHarness();
    service.JournalEntryRepo.find.mockResolvedValue([]);

    await service.fetchJournalEntries('firebase-user', '123456789', '2026-01-01', '2026-12-31');

    expect(service.JournalEntryRepo.find).toHaveBeenCalledWith({
      where: {
        issuerBusinessNumber: '123456789',
        date: Between('2026-01-01', '2026-12-31'),
      },
      order: { id: 'ASC' },
    });
  });

  it('starts every repeated and concurrent BKMVDATA generation at record number 000000001', async () => {
    const service = createHarness();
    stubEmptyDataSections(service);
    service.generateUniqueId = jest
      .fn()
      .mockReturnValueOnce('111111111111111')
      .mockReturnValueOnce('222222222222222');
    service.getCurrentTimestamp = jest.fn().mockReturnValue('10120930');
    service.buildUniformSummaries = jest.fn().mockResolvedValue({
      document_summary: [],
      list_summary: [],
    });

    const results = await Promise.all([
      service.createUniformFile('user-1', '2026-01-01', '2026-12-31', '123456789'),
      service.createUniformFile('user-2', '2026-01-01', '2026-12-31', '987654321'),
    ]);

    const payloads = results.map((result) => iconv.decode(result.bkmvdataBuffer, 'windows-1255'));
    expect(payloads[0]).toMatch(/^A100000000001123456789111111111111111/);
    expect(payloads[0]).toMatch(/Z900000000002123456789111111111111111/);
    expect(payloads[1]).toMatch(/^A100000000001987654321222222222222222/);
    expect(payloads[1]).toMatch(/Z900000000002987654321222222222222222/);
  });

  it('keeps summaries isolated across concurrent generations', async () => {
    const service = createHarness();
    stubEmptyDataSections(service);
    service.generateUniqueId = jest
      .fn()
      .mockReturnValueOnce('111111111111111')
      .mockReturnValueOnce('222222222222222');
    service.getCurrentTimestamp = jest.fn().mockReturnValue('10120930');
    service.fetchDocuments.mockImplementation(async (businessNumber: string) => [{
      issuerBusinessNumber: businessNumber,
      docType: 'TAX_INVOICE',
    }]);
    service.generateC100Section
      .mockImplementationOnce(async (documents, state) =>
        validC100Record(state, documents[0].issuerBusinessNumber),
      )
      .mockImplementationOnce(async (documents, state) =>
        validC100Record(state, documents[0].issuerBusinessNumber)
          + validC100Record(state, documents[0].issuerBusinessNumber),
      );
    service.buildUniformSummaries = jest.fn().mockImplementation(
      async (_businessNumber, _startDate, _endDate, recordSummary) => ({
        document_summary: [],
        list_summary: [{
          listNumber: 'C100',
          listDescription: 'כותרת מסמך',
          listTotal: recordSummary.C100,
        }],
      }),
    );

    const [first, second] = await Promise.all([
      service.createUniformFile('user-1', '2026-01-01', '2026-12-31', '123456789'),
      service.createUniformFile('user-2', '2026-01-01', '2026-12-31', '987654321'),
    ]);

    expect(first.list_summary[0].listTotal).toBe(1);
    expect(second.list_summary[0].listTotal).toBe(2);
    expect(iconv.decode(first.iniBuffer, 'windows-1255')).toContain('C100000000000000001');
    expect(iconv.decode(second.iniBuffer, 'windows-1255')).toContain('C100000000000000002');
  });

  it('builds B110 only from the effective chart resolved for the requested business', async () => {
    const service = createHarness();
    const state = createGenerationState();
    const context = { businessNumber: '123456789', accountantIds: ['agent-1'] };
    service.catalogContextService.forUser.mockResolvedValue(context);
    service.catalogService.getEffectiveAccounts.mockResolvedValue([
      {
        code: '80000',
        name: 'כרטיס לקוח',
        code6111: '3680',
        section: { code: '60000', name: 'הוצאות' },
      },
    ]);

    const result = await service.generateB110Section(
      'firebase-user',
      '123456789',
      '2026-01-01',
      '2026-12-31',
      state,
    );

    expect(service.catalogContextService.forUser).toHaveBeenCalledWith(
      'firebase-user',
      '123456789',
    );
    expect(service.catalogService.getEffectiveAccounts).toHaveBeenCalledWith(context);
    expect(result).toHaveLength(376 + 2);
    expect(result).toMatch(/^B11000000000112345678980000!!!!!!!!!!/);
    expect(result).toContain('כרטיס לקוח');
    expect(result).toContain('60000!!!!!!!!!!');
    expect(result).toContain('3680');
  });

  it('calculates B110 opening, debit, and credit balances for the requested period', async () => {
    const service = createHarness();
    const state = createGenerationState();
    const queryBuilder = createBalanceQueryBuilder([{
      accountCode: '40000',
      openingBalance: '-25.50',
      totalDebit: '100.00',
      totalCredit: '40.25',
    }]);
    service.JournalLineRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    service.catalogContextService.forUser.mockResolvedValue({ businessNumber: '123456789' });
    service.catalogService.getEffectiveAccounts.mockResolvedValue([{
      code: '40000',
      name: 'הכנסות',
      code6111: '1000',
      section: { code: '40000', name: 'הכנסות' },
    }]);

    const result = await service.generateB110Section(
      'firebase-user',
      '123456789',
      '2026-01-01',
      '2026-12-31',
      state,
    );

    expect(result.slice(277, 292)).toBe('-00000000002550');
    expect(result.slice(292, 307)).toBe('+00000000010000');
    expect(result.slice(307, 322)).toBe('+00000000004025');
    expect(result.slice(322, 326)).toBe('1000');
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'entry.firebaseId = :userId',
      { userId: 'firebase-user' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'entry.issuerBusinessNumber = :businessNumber',
      { businessNumber: '123456789' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'entry.date <= :endDate',
      { endDate: '2026-12-31' },
    );
    expect(queryBuilder.setParameter).toHaveBeenCalledWith('startDate', '2026-01-01');
  });

  it('emits every populated BKMVDATA record at its official 1.31 byte length', async () => {
    const service = createHarness() as any;
    const state = createGenerationState();
    const date = new Date('2026-01-15T10:30:00');
    const document = {
      issuerBusinessNumber: '123456789', docType: 'TAX_INVOICE', docNumber: '42',
      issueDate: date, issueHour: '1030', recipientName: 'לקוח', recipientStreet: '',
      recipientHomeNumber: '', recipientCity: '', recipientPostalCode: '', recipientState: '',
      recipientStateCode: '', recipientPhone: '', recipientId: '', valueDate: date,
      amountForeign: 0, currency: 'ILS', sumBefDisBefVat: 100, disSum: 0,
      sumAftDisBefVAT: 100, vatSum: 18, sumAftDisWithVAT: 118,
      withholdingTaxAmount: 0, customerKey: 'C1', matchField: '', isCancelled: false,
      docDate: date, branchCode: '', operationPerformer: '', generalDocIndex: 1,
      parentDocType: null, parentDocNumber: '',
    };
    service.docLinesRepo = { find: jest.fn().mockResolvedValue([{
      lineNumber: 1, transType: 1, description: 'שירות', manufacturerName: '',
      productSerialNumber: '', unitType: 'יחידה', unitQuantity: 1,
      sumBefVatPerUnit: 100, disBefVatPerLine: 0, sumAftDisBefVatPerLine: 100,
      vatRate: 18, generalDocIndex: 1,
    }]) };
    service.docPaymentsRepo = { find: jest.fn().mockResolvedValue([{
      paymentLineNumber: 1, paymentMethod: PaymentMethodType.BANK_TRANSFER,
      bankNumber: '', branchNumber: '',
      accountNumber: '', checkNumber: '', paymentDate: date, paymentAmount: 118,
      cardCompany: '', creditCardName: '', creditTransType: '', generalDocIndex: 1,
    }]) };
    service.JournalLineRepo.find.mockResolvedValue([{
      lineInEntry: 1, accountCode: '40000', debit: 0, credit: 118,
    }]);
    service.catalogContextService.forUser.mockResolvedValue({ businessNumber: '123456789' });
    service.catalogService.getEffectiveAccounts.mockResolvedValue([{
      code: '40000', name: 'הכנסות', code6111: '1000',
      section: { code: '40000', name: 'הכנסות' },
    }]);

    const records = [
      await service.generateC100Section([document], state),
      await service.generateD110Section([document], state),
      await service.generateD120Section([document], state),
      await service.generateB100Section([{
        id: 1, issuerBusinessNumber: '123456789', referenceId: '42',
        referenceType: 'TAX_INVOICE', date, createdAt: date,
      }], state),
      await service.generateB110Section(
        'firebase-user', '123456789', '2026-01-01', '2026-12-31', state,
      ),
    ];
    const expectedLengths = [444, 339, 222, 317, 376];

    const d120PaymentTypeOffset = FIELD_MAP.D120
      .slice(0, FIELD_MAP.D120.findIndex(({ field }) => field === 'f_1306'))
      .reduce((sum, { length }) => sum + length, 0);
    expect(records[2].slice(d120PaymentTypeOffset, d120PaymentTypeOffset + 1)).toBe('4');

    records.forEach((record, index) => {
      expect(record.endsWith('\r\n')).toBe(true);
      expect(iconv.encode(record.slice(0, -2), 'windows-1255')).toHaveLength(expectedLengths[index]);
    });
  });

  it('emits D110 amount 1267 before discount so it reconciles with C100 amount 1219', async () => {
    const service = createHarness() as any;
    const state = createGenerationState();
    const date = new Date('2026-02-15T10:30:00');
    const document = {
      issuerBusinessNumber: '123456789', docType: 'TAX_INVOICE_RECEIPT', docNumber: '42',
      docDate: date, branchCode: '', generalDocIndex: 1, parentDocType: null, parentDocNumber: '',
    };
    service.docLinesRepo = { find: jest.fn().mockResolvedValue([{
      lineNumber: 1, transType: 1, description: 'שירות', manufacturerName: '',
      productSerialNumber: '', unitType: 'יחידה', unitQuantity: 1,
      sumBefVatPerUnit: 5500, disBefVatPerLine: 500, sumAftDisBefVatPerLine: 5000,
      vatRate: 18, generalDocIndex: 1,
    }]) };

    const record = (await service.generateD110Section([document], state)).slice(0, -2);
    const fields = Object.fromEntries(FIELD_MAP.D110.map(({ field, length }, index, definitions) => {
      const offset = definitions.slice(0, index).reduce((sum, item) => sum + item.length, 0);
      return [field, record.slice(offset, offset + length)];
    }));

    expect(fields.f_1266).toBe('-00000000050000');
    expect(fields.f_1267).toBe('+00000000550000');
  });

  it('does not fabricate M100 inventory rows without an inventory ledger', async () => {
    const service = createHarness();

    await expect(service.generateM100Section('123456789', createGenerationState()))
      .resolves.toBe('');
  });
});
