export class AdvanceIncomeTaxReportDto {
  /** EXEMPT | LICENSED | COMPANY – לקביעת שדות להצגה בפרונט */
  businessType: string;
  /** עוסק מורשה: סך עסקאות חייבות. עוסק פטור: 0 */
  vatableTurnover: number;
  /** עוסק מורשה: סך עסקאות פטורות. עוסק פטור: 0 */
  nonVatableTurnover: number;
  /** עוסק מורשה: סך מע"מ עסקאות. עוסק פטור: 0 */
  vatOnTurnover: number;
  /** עוסק מורשה: סה"כ הכנסות. עוסק פטור: סך עסקאות */
  totalIncome: number;
  advanceTaxPercent: number;
  totalAdvanceTax: number;
  taxWithholdingAtSource: number;
  totalToPay: number;
}
