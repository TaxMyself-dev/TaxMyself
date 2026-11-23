import { DataSource, InsertQueryBuilder } from 'typeorm';
import { SlimTransaction } from './slim-transaction.entity';
import { TransactionProcessingService } from './transaction-processing.service';

describe('Classification MySQL upsert column names', () => {
  let dataSource: DataSource;
  beforeAll(async () => {
    dataSource = new DataSource({ type: 'mysql', database: 'metadata_only', entities: [SlimTransaction] });
    // Build real entity metadata without opening a database connection.
    await (dataSource as any).buildMetadatas();
  });
  afterEach(() => jest.restoreAllMocks());

  it('generates valid MySQL updates for mapped classification and document columns', async () => {
    const repo = dataSource.getRepository(SlimTransaction);
    let sql = '';
    jest.spyOn(InsertQueryBuilder.prototype, 'execute').mockImplementation(async function () {
      sql = this.getQuery();
      return { identifiers: [], generatedMaps: [], raw: [] };
    });
    const service: any = Object.create(TransactionProcessingService.prototype);
    service.slimRepo = repo;
    await service.upsertSlimTransactions([{
      userId: 'synthetic-owner', externalTransactionId: 'synthetic-transaction',
      subCategoryId: 25, matchedDocumentId: 9, category: 'Test',
    }]);
    const updateClause = sql.split('ON DUPLICATE KEY UPDATE')[1];
    expect(updateClause).toContain('`sub_category_id` = VALUES(`sub_category_id`)');
    expect(updateClause).toContain('`matched_document_id` = VALUES(`matched_document_id`)');
    expect(updateClause).not.toContain('`subCategoryId`');
    expect(updateClause).not.toContain('`matchedDocumentId`');
    expect(updateClause).not.toContain('`userId` =');
    expect(updateClause).not.toContain('`externalTransactionId` =');
  });
});
