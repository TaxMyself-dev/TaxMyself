import { BusinessType, VATReportingType } from './enums';
import { Business, ISelectItem } from './interface';

const VAT_REGISTERED_BUSINESS_TYPES = new Set<BusinessType>([
  BusinessType.LICENSED,
  BusinessType.LIMITED_COMPANY,
  BusinessType.AUTHORIZED_PARTNERSHIP,
]);

const VAT_REPORTING_TYPES = new Set<VATReportingType>([
  VATReportingType.MONTHLY_REPORT,
  VATReportingType.DUAL_MONTH_REPORT,
]);

export type VatReportEligibleBusiness = Business & { businessNumber: string };

/**
 * A business can produce a VAT report only when both canonical pieces of its
 * registration agree: its tax-registration type is VAT registered and its VAT
 * reporting cadence requires reports. Display labels are deliberately ignored.
 */
export function isVatReportEligibleBusiness(
  business: Pick<Business, 'businessType' | 'vatReportingType'>,
): boolean {
  return VAT_REGISTERED_BUSINESS_TYPES.has(business.businessType as BusinessType)
    && VAT_REPORTING_TYPES.has(business.vatReportingType as VATReportingType);
}

export function getVatReportEligibleBusinesses(
  businesses: Business[],
): VatReportEligibleBusiness[] {
  return businesses.filter(
    (business) => !!business.businessNumber && isVatReportEligibleBusiness(business),
  ) as VatReportEligibleBusiness[];
}

export function getVatReportBusinessSelectItems(businesses: Business[]): ISelectItem[] {
  return getVatReportEligibleBusinesses(businesses).map((business) => ({
    name: business.businessName,
    value: business.businessNumber,
  }));
}

/** Returns a requested eligible number, or the first eligible business. */
export function resolveVatReportBusinessNumber(
  businesses: Business[],
  requestedBusinessNumber?: string | null,
): string {
  const eligible = getVatReportEligibleBusinesses(businesses);
  const requested = eligible.find(
    (business) => business.businessNumber === requestedBusinessNumber,
  );
  return requested?.businessNumber ?? eligible[0]?.businessNumber ?? '';
}
