import { signal } from '@angular/core';
import { DocCreatePage } from './doc-create.page';

describe('current discount basis characterization', () => {
  for (const option of ['INCLUDE', 'EXCLUDE', 'WITHOUT']) {
    it(`${option}: compares current line total with the current document total`, () => {
      const page: any = Object.create(DocCreatePage.prototype);
      page.lineItemsDraft = signal([{sum: option === 'INCLUDE' ? 1180 : 1000,
        unitQuantity: 1, discount: option === 'INCLUDE' ? 118 : 100,
        vatOpts: option, vatRate: 18}]);
      page.documentSummary = signal({}); page.documentTotals = signal({});
      page.isExemptBusiness = () => option === 'WITHOUT';
      page.calcTotals = () => {};
      page.calculateVatFieldsForLine(0);
      const line = page.lineItemsDraft()[0];
      const totals = page.documentTotals();
      if (option === 'INCLUDE') {
        expect(line.disBefVatPerLine).toBe(100);
        expect(page.documentSummary().totalDiscount).toBe(118);
        expect(line.sumAftDisWithVat).toBe(1062);
        expect(totals.sumAftDisWithVat).toBe(1044);
      } else {
        expect(totals.sumAftDisWithVat).toBe(line.sumAftDisWithVat);
        expect(totals.sumAftDisWithVat).toBe(option === 'WITHOUT' ? 900 : 1062);
      }
    });
  }
});
