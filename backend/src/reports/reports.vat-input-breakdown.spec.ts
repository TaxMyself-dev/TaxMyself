import { ReportsService } from './reports.service';

describe('ReportsService VAT input breakdown attachments', () => {
  it('returns both legacy and Drive source-document attachment metadata', async () => {
    const rows = [
      {
        expenseId: '17',
        supplier: 'Supplier',
        date: '2026-01-01',
        sum: '117',
        category: 'Office',
        subCategory: 'Supplies',
        vatAmount: '17',
        totalTaxPayable: '100',
        vatPercent: '100',
        taxPercent: '100',
        isEquipment: '0',
        file: 'expenses/manual.pdf',
        sourceDocumentId: '42',
        sourceDocumentFileName: 'drive-source.pdf',
        journalEntryId: '8',
        journalLineId: '9',
      },
    ];
    const queryBuilder: any = {};
    for (const method of [
      'innerJoin',
      'leftJoin',
      'where',
      'andWhere',
      'select',
      'addSelect',
      'orderBy',
      'addOrderBy',
    ]) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.getRawMany = jest.fn().mockResolvedValue(rows);

    const fakeService = {
      JournalLineRepo: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
      applyVatJournalPeriodFilter: jest.fn(),
    };

    const result = await (ReportsService.prototype as any).loadVatInputBreakdown.call(
      fakeService,
      'client-1',
      '123456789',
      new Date('2026-01-01'),
      new Date('2026-02-28'),
      ['1-2/2026'],
    );

    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      'expense.sourceDocumentId',
      'sourceDocumentId',
    );
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      'sourceDocument.driveFileName',
      'sourceDocumentFileName',
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 17,
        file: 'expenses/manual.pdf',
        sourceDocumentId: 42,
        sourceDocumentFileName: 'drive-source.pdf',
        totalVatPayable: 17,
      }),
    ]);
  });
});
