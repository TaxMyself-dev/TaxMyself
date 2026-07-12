/**
 * Regression test: DocumentsService.buildExtractionCatalog
 * (GET /documents/me/catalog, and the OCR classification hint fed to Claude).
 *
 * Previously read the legacy DefaultSubCategory/UserSubCategory tables
 * directly via TypeORM repos — missed by the Phase 2.4 catalog CRUD port
 * (audit §5.6 flagged this exact method as a consumer). DefaultSubCategory's
 * entity declares a `subAccountCode` column that was never actually present
 * in production (schema-drift.md Gap 1), so a plain `.find()` against a
 * real prod-shaped DB (keepintax_prodcopy) 500ed with "Unknown column
 * 'DefaultSubCategory.subAccountCode'". Ported to
 * CatalogService.getMergedExpenseCatalog — this test guards against
 * re-introducing a direct legacy-table read here.
 */
import { DocumentsService } from './documents.service';

describe('DocumentsService.buildExtractionCatalog', () => {
  it('maps CatalogService.getMergedExpenseCatalog rows into the legacy CatalogEntry shape', async () => {
    const getMergedExpenseCatalog = jest.fn().mockResolvedValue([
      {
        id: 11,
        name: 'דלק',
        category: { name: 'רכב ותחבורה' },
        account: { taxPercent: 45, vatPercent: 66.66, isEquipment: false },
      },
      {
        id: 12,
        name: 'ציוד',
        category: { name: 'ציוד ורכוש קבוע' },
        account: { taxPercent: 100, vatPercent: 100, isEquipment: true },
      },
      // isPrivate sub-category — no card, no law (D5).
      {
        id: 13,
        name: 'הוצאה פרטית',
        category: { name: 'פרטי' },
        account: null,
      },
    ]);
    const fakeThis = { catalogService: { getMergedExpenseCatalog } };

    const catalog = await DocumentsService.prototype.buildExtractionCatalog.call(
      fakeThis as any,
      'someFirebaseId',
      '123456789',
    );

    expect(getMergedExpenseCatalog).toHaveBeenCalledWith({ businessNumber: '123456789' });
    expect(catalog).toEqual([
      { subCategoryName: 'דלק', categoryName: 'רכב ותחבורה', taxPercent: 45, vatPercent: 66.66, isEquipment: false, subCategoryId: 11 },
      { subCategoryName: 'ציוד', categoryName: 'ציוד ורכוש קבוע', taxPercent: 100, vatPercent: 100, isEquipment: true, subCategoryId: 12 },
      { subCategoryName: 'הוצאה פרטית', categoryName: 'פרטי', taxPercent: 0, vatPercent: 0, isEquipment: false, subCategoryId: 13 },
    ]);
  });

  it('never touches a legacy DefaultSubCategory/UserSubCategory repo', async () => {
    // No defaultSubCategoryRepo/userSubCategoryRepo on fakeThis at all — if
    // buildExtractionCatalog ever referenced them again, this call throws.
    const fakeThis = { catalogService: { getMergedExpenseCatalog: jest.fn().mockResolvedValue([]) } };

    await expect(
      DocumentsService.prototype.buildExtractionCatalog.call(fakeThis as any, 'x', '123456789'),
    ).resolves.toEqual([]);
  });
});
