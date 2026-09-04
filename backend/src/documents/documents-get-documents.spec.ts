import { DocumentsService } from './documents.service';

describe('DocumentsService.getDocuments', () => {
  it('orders issued documents by docDate DESC, then id DESC', async () => {
    const docs = [
      { id: 9, docDate: new Date('2026-09-03') },
      { id: 8, docDate: new Date('2026-09-03') },
      { id: 7, docDate: new Date('2026-09-02') },
    ];
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(docs),
    };
    const fakeThis = {
      businessService: {
        getBusinessByNumber: jest
          .fn()
          .mockResolvedValue({ businessNumber: '123456789' }),
      },
      sharedService: {
        convertStringToDateObject: jest.fn((value: string) => new Date(value)),
      },
      documentsRepo: {
        createQueryBuilder: jest.fn().mockReturnValue(query),
      },
    };

    await expect(
      DocumentsService.prototype.getDocuments.call(
        fakeThis as any,
        '123456789',
        'firebase-user',
      ),
    ).resolves.toBe(docs);

    expect(query.orderBy).toHaveBeenCalledWith('doc.docDate', 'DESC');
    expect(query.addOrderBy).toHaveBeenCalledWith('doc.id', 'DESC');
    expect(query.orderBy.mock.invocationCallOrder[0]).toBeLessThan(
      query.addOrderBy.mock.invocationCallOrder[0],
    );
    expect(query.addOrderBy.mock.invocationCallOrder[0]).toBeLessThan(
      query.getMany.mock.invocationCallOrder[0],
    );
  });
});
