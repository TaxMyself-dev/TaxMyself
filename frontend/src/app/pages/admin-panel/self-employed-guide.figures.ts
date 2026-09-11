export interface IncomeTaxBracket {
  upperBound: number | null;
  rate: number;
}

export const SELF_EMPLOYED_GUIDE_FIGURES = {
  taxYear: 2026,
  vatExemptTurnoverCeiling: 122_833,
  annualCreditPointValue: 2_904,
  incomeTaxBrackets: [
    { upperBound: 84_120, rate: 0.1 },
    { upperBound: 120_720, rate: 0.14 },
    { upperBound: 228_000, rate: 0.2 },
    { upperBound: 301_200, rate: 0.31 },
    { upperBound: 560_280, rate: 0.35 },
    { upperBound: 721_560, rate: 0.47 },
    { upperBound: null, rate: 0.5 },
  ] as readonly IncomeTaxBracket[],
  lastReviewed: '11.09.2026',
  sources: {
    vatExemptCeiling: 'https://www.gov.il/he/service/request-open-exempt-dealer-via-internet',
    microBusiness: 'https://www.gov.il/he/service/request-transfer-to-micro-business-owner',
    microBusinessGuidance: 'https://www.gov.il/BlobFolder/policy/inst-07-2025/he/IncomeTax_inst-07-2025.pdf',
    taxCoordination: 'https://www.gov.il/he/service/tax-coordination-online',
    incomeTax2026: 'https://www.gov.il/BlobFolder/reports/press-income-tax-brackets/he/SalaryDataDetails_tax_bracket_2026.pdf',
  },
} as const;
