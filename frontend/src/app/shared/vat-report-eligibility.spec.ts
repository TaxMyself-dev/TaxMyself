import { BusinessType, VATReportingType } from './enums';
import { Business } from './interface';
import {
  getVatReportBusinessSelectItems,
  getVatReportEligibleBusinesses,
  isVatReportEligibleBusiness,
  resolveVatReportBusinessNumber,
} from './vat-report-eligibility';

const business = (
  businessNumber: string,
  businessType: BusinessType,
  vatReportingType: VATReportingType,
): Business => ({
  businessNumber,
  businessName: businessNumber,
  businessType,
  vatReportingType,
} as Business);

describe('VAT report business eligibility', () => {
  const exempt = business('exempt', BusinessType.EXEMPT, VATReportingType.NOT_REQUIRED);
  const licensed = business('licensed', BusinessType.LICENSED, VATReportingType.MONTHLY_REPORT);

  it('returns no eligible business for an exempt-only account', () => {
    expect(getVatReportEligibleBusinesses([exempt])).toEqual([]);
  });

  it('automatically resolves the only eligible business', () => {
    expect(resolveVatReportBusinessNumber([licensed])).toBe('licensed');
    expect(getVatReportBusinessSelectItems([licensed])).toEqual([
      { name: 'licensed', value: 'licensed' },
    ]);
  });

  it('excludes the exempt business from a mixed exempt and licensed account', () => {
    expect(getVatReportEligibleBusinesses([exempt, licensed])).toEqual([licensed]);
    expect(resolveVatReportBusinessNumber([exempt, licensed], 'exempt')).toBe('licensed');
  });

  it('keeps all VAT-registered businesses for a multi-business selector', () => {
    const company = business(
      'company',
      BusinessType.LIMITED_COMPANY,
      VATReportingType.DUAL_MONTH_REPORT,
    );

    expect(getVatReportBusinessSelectItems([exempt, licensed, company])).toEqual([
      { name: 'licensed', value: 'licensed' },
      { name: 'company', value: 'company' },
    ]);
  });

  it('requires both a VAT-registered type and a reporting cadence', () => {
    expect(isVatReportEligibleBusiness(
      business('bad-cadence', BusinessType.LICENSED, VATReportingType.NOT_REQUIRED),
    )).toBeFalse();
    expect(isVatReportEligibleBusiness(
      business('bad-type', BusinessType.EXEMPT, VATReportingType.MONTHLY_REPORT),
    )).toBeFalse();
  });
});
