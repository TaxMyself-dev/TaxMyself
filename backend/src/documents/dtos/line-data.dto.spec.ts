import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DocumentType, UnitOfMeasure } from 'src/enum';
import { LineDataDto } from './line-data.dto';

describe('LineDataDto draft restoration normalization', () => {
  it('normalizes MySQL DECIMAL and enum values from a restored draft', async () => {
    const dto = plainToInstance(LineDataDto, {
      lineNumber: 1,
      docType: DocumentType.TAX_INVOICE,
      transType: '3',
      description: 'Restored line',
      unitQuantity: '1.0000',
      sum: 6000,
      discount: '0.00',
      vatOpts: 2,
      vatRate: '18.00',
      sumBefVatPerUnit: '6000.0000',
      disBefVatPerLine: '0.00',
      sumAftDisBefVatPerLine: '6000.00',
      vatPerLine: '1080.00',
      sumAftDisWithVat: '6000.001080.00',
      unitType: UnitOfMeasure.UNIT,
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({
      unitQuantity: 1,
      discount: 0,
      vatOpts: 'EXCLUDE',
      vatRate: 18,
      sumBefVatPerUnit: 6000,
      disBefVatPerLine: 0,
      sumAftDisBefVatPerLine: 6000,
      vatPerLine: 1080,
      sumAftDisWithVat: 7080,
      unitType: UnitOfMeasure.UNIT,
    });
  });
});
