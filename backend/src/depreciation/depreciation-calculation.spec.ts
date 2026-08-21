import { BadRequestException } from '@nestjs/common';
import {
  calculateDepreciationSchedule,
  daysInTaxYear,
} from './depreciation-calculation';

function asset(
  purchaseDate: string,
  activationDate: string | null,
  cost: number,
  rate: number,
) {
  return {
    date: purchaseDate as any,
    activationDate: activationDate as any,
    sum: cost,
    reductionPercentSnapshot: rate,
  };
}

describe('calculateDepreciationSchedule', () => {
  it('prorates the activation year by inclusive calendar days', () => {
    const rows = calculateDepreciationSchedule(
      asset('2025-05-15', '2025-05-15', 2360, 15),
      2025,
    );

    expect(rows).toEqual([
      expect.objectContaining({
        taxYear: 2025,
        activeDays: 231,
        daysInYear: 365,
        amount: 224.04,
        remainingBalance: 2135.96,
      }),
    ]);
  });

  it('uses 366 days in a leap year and includes February 29', () => {
    const rows = calculateDepreciationSchedule(
      asset('2024-02-29', '2024-02-29', 3660, 10),
      2024,
    );

    expect(daysInTaxYear(2024)).toBe(366);
    expect(rows[0]).toEqual(expect.objectContaining({
      activeDays: 307,
      daysInYear: 366,
      amount: 307,
    }));
  });

  it('recognizes one day when an asset is activated on December 31', () => {
    const rows = calculateDepreciationSchedule(
      asset('2025-12-31', '2025-12-31', 3650, 10),
      2025,
    );

    expect(rows[0]).toEqual(expect.objectContaining({ activeDays: 1, amount: 1 }));
  });

  it('starts at activation, even when purchase was in an earlier year', () => {
    const rows = calculateDepreciationSchedule(
      asset('2024-11-01', '2025-01-10', 3650, 10),
      2025,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      taxYear: 2025,
      activeDays: 356,
      amount: 356,
    }));
  });

  it('caps the final year so accumulated depreciation cannot exceed cost', () => {
    const rows = calculateDepreciationSchedule(
      asset('2025-01-01', '2025-01-01', 1000, 40),
      2030,
    );

    expect(rows.map((row) => row.amount)).toEqual([400, 400, 200]);
    expect(rows[2].remainingBalance).toBe(0);
  });

  it('falls back to purchase date when activation date is absent', () => {
    const rows = calculateDepreciationSchedule(
      asset('2025-07-01', null, 3650, 10),
      2025,
    );

    expect(rows[0].activationDate).toBe('2025-07-01');
    expect(rows[0].activeDays).toBe(184);
  });

  it('rejects activation before purchase', () => {
    expect(() => calculateDepreciationSchedule(
      asset('2025-05-15', '2025-05-14', 1000, 10),
      2025,
    )).toThrow(BadRequestException);
  });

  it('rejects a calendar date that only looks ISO-formatted', () => {
    expect(() => calculateDepreciationSchedule(
      asset('2025-02-01', '2025-02-30', 1000, 10),
      2025,
    )).toThrow(BadRequestException);
  });
});
