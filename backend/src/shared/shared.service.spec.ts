import { SharedService } from './shared.service';

describe('SharedService.getVatRateByYear', () => {
  const sharedService = Object.create(SharedService.prototype) as SharedService;

  it.each([2020, 2021, 2022])('returns 17%% for %i', (year) => {
    expect(sharedService.getVatRateByYear(new Date(year, 0, 1))).toBe(0.17);
  });

  it('preserves the 2025 rate', () => {
    expect(sharedService.getVatRateByYear(new Date(2025, 0, 1))).toBe(0.18);
  });
});
