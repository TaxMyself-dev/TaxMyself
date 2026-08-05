/**
 * Unit tests: Phase 6.1 — D9 per-row classification/resolution preview
 * (ReportReviewService.classifyReviewRow).
 *
 * Covers the ReviewMappingStatus verdicts (READY / MISSING_MAPPING /
 * PRIVATE / UNCLASSIFIED), the name-over-stamped-id match order, the D7
 * description preview chain, and the mappedByAccountant badge signal.
 *
 * Uses the prototype.call(fakeThis) pattern — no full provider tree.
 */
import { ReportReviewService } from './report-review.service';
import { ApprovalStatus, OwnerType } from '../enum';

const classify = (catalog: any[], owner: string, source: any, stampedId: number | null = null) =>
  (ReportReviewService.prototype as any).classifyReviewRow.call(
    {},
    catalog,
    owner,
    source,
    stampedId,
  );

/** Minimal merged-catalog SubCategory row with a mapped card. */
const mappedSub = (over: Partial<any> = {}) => ({
  id: 10,
  name: 'דלק',
  isPrivate: false,
  approvalStatus: ApprovalStatus.APPROVED,
  ownerType: OwnerType.SYSTEM,
  approvedByUserId: null,
  category: { name: 'רכב ותחבורה' },
  account: {
    id: 7,
    code: '60220',
    name: 'דלק',
    vatPercent: '66.67',
    taxPercent: '45',
    reductionPercent: '0',
    isEquipment: false,
    section: { code: '60200', name: 'רכב ותחבורה' },
  },
  ...over,
});

describe('ReportReviewService.classifyReviewRow — status verdicts', () => {
  it('READY: mapped + APPROVED sub_category → full card law + section on the wire', () => {
    const c = classify([mappedSub()], 'client-1', { category: 'רכב ותחבורה', subCategory: 'דלק' });
    expect(c.status).toBe('READY');
    expect(c.subCategoryId).toBe(10);
    expect(c.accountId).toBe(7);
    expect(c.accountCode).toBe('60220');
    expect(c.sectionName).toBe('רכב ותחבורה');
    expect(c.vatPercent).toBe(66.67);
    expect(c.taxPercent).toBe(45);
    expect(c.reductionPercent).toBe(0);
    expect(c.isEquipment).toBe(false);
    expect(c.description).toBe('רכב ותחבורה/דלק');
  });

  it('MISSING_MAPPING: sub_category without a card (deferred to accountant)', () => {
    const sub = mappedSub({
      account: null,
      approvalStatus: ApprovalStatus.MISSING_ACCOUNTING_MAPPING,
    });
    const c = classify([sub], 'client-1', { category: 'רכב ותחבורה', subCategory: 'דלק' });
    expect(c.status).toBe('MISSING_MAPPING');
    expect(c.accountId).toBeNull();
    expect(c.sectionName).toBeNull();
    // Description still renders from the names (D7 branch 1).
    expect(c.description).toBe('רכב ותחבורה/דלק');
  });

  it('MISSING_MAPPING: card present but sub_category not APPROVED (PENDING_ACCOUNTANT_APPROVAL)', () => {
    const sub = mappedSub({ approvalStatus: ApprovalStatus.PENDING_ACCOUNTANT_APPROVAL });
    const c = classify([sub], 'client-1', { category: 'רכב ותחבורה', subCategory: 'דלק' });
    expect(c.status).toBe('MISSING_MAPPING');
  });

  it('PRIVATE: isPrivate row — approvable but never journaled', () => {
    const sub = mappedSub({ isPrivate: true, account: null, name: 'סופרמרקט', category: { name: 'אוכל וצריכה שוטפת' } });
    const c = classify([sub], 'client-1', { category: 'אוכל וצריכה שוטפת', subCategory: 'סופרמרקט' });
    expect(c.status).toBe('PRIVATE');
    expect(c.accountId).toBeNull();
  });

  it('UNCLASSIFIED: names match nothing in the catalog', () => {
    const c = classify([mappedSub()], 'client-1', { category: 'זבל', subCategory: 'לא קיים' });
    expect(c.status).toBe('UNCLASSIFIED');
    expect(c.subCategoryId).toBeNull();
    expect(c.description).toBe('מסמך לא מזוהה');
  });

  it('UNCLASSIFIED with a recognized doc type → D7 branch 2 (type label + detail)', () => {
    const c = classify([], 'client-1', {
      category: null,
      subCategory: null,
      documentType: 'form_106',
      supplier: 'מעסיק בע"מ',
      invoiceNumber: null,
    });
    expect(c.status).toBe('UNCLASSIFIED');
    expect(c.description).toBe('טופס 106 - מעסיק בע"מ');
  });
});

describe('ReportReviewService.classifyReviewRow — match order', () => {
  it('exact (category, subCategory) pair wins over a bare sub-name match in another category', () => {
    const inBank = mappedSub({
      id: 21,
      name: 'עמלות ודמי כרטיס',
      category: { name: 'בנק, אשראי ותנועות' },
    });
    const inBusiness = mappedSub({
      id: 22,
      name: 'עמלות ודמי כרטיס',
      category: { name: 'עסק' },
    });
    const c = classify([inBank, inBusiness], 'client-1', {
      category: 'עסק',
      subCategory: 'עמלות ודמי כרטיס',
    });
    expect(c.subCategoryId).toBe(22);
    expect(c.categoryName).toBe('עסק');
  });

  it('names win over the stamped OCR-time id (saved-supplier override case)', () => {
    // The doc was stamped subCategoryId=10 (דלק) at OCR time, but the saved
    // supplier's names re-pointed the row at אחזקת רכב/טיפולים in toDocSummary.
    const fuel = mappedSub();
    const repairs = mappedSub({ id: 11, name: 'טיפולים', category: { name: 'רכב ותחבורה' } });
    const c = classify([fuel, repairs], 'client-1', { category: 'רכב ותחבורה', subCategory: 'טיפולים' }, 10);
    expect(c.subCategoryId).toBe(11);
  });

  it('stamped id is the fallback when the names match nothing (renamed row)', () => {
    const c = classify([mappedSub()], 'client-1', { category: 'ישן', subCategory: 'שם שהוחלף' }, 10);
    expect(c.subCategoryId).toBe(10);
    expect(c.subCategoryName).toBe('דלק');
    // Canonical names from the catalog row, not the stale strings.
    expect(c.description).toBe('רכב ותחבורה/דלק');
  });
});

describe('ReportReviewService.classifyReviewRow — mappedByAccountant badge', () => {
  it('ACCOUNTANT-owned effective row → true', () => {
    const sub = mappedSub({ ownerType: OwnerType.ACCOUNTANT });
    const c = classify([sub], 'client-1', { category: 'רכב ותחבורה', subCategory: 'דלק' });
    expect(c.mappedByAccountant).toBe(true);
  });

  it('CLIENT row approved by someone other than the client → true', () => {
    const sub = mappedSub({ ownerType: OwnerType.CLIENT, approvedByUserId: 'agent-9' });
    const c = classify([sub], 'client-1', { category: 'רכב ותחבורה', subCategory: 'דלק' });
    expect(c.mappedByAccountant).toBe(true);
  });

  it('CLIENT row approved by the client themself → false', () => {
    const sub = mappedSub({ ownerType: OwnerType.CLIENT, approvedByUserId: 'client-1' });
    const c = classify([sub], 'client-1', { category: 'רכב ותחבורה', subCategory: 'דלק' });
    expect(c.mappedByAccountant).toBe(false);
  });

  it('plain SYSTEM row → false', () => {
    const c = classify([mappedSub()], 'client-1', { category: 'רכב ותחבורה', subCategory: 'דלק' });
    expect(c.mappedByAccountant).toBe(false);
  });
});
