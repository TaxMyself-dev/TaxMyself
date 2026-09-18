/** Educational 2026 estimate only. No server/reporting consumers. Sources in docs/marketing/vat-national-insurance-guide.md. */
export const NI_2026 = {
  year: 2026, definitionIncome: 6885, combinedIncome: 2065,
  fullHours: 20, combinedHours: 12, exemptIncome: 3442,
  reducedCeiling: 7703, maximumIncome: 51910, minimumSelfIncome: 3442,
  minimumNonWorker: 266, deduction: .52,
  selfLow: .0447, selfHigh: .1283, healthLow: .0323, healthHigh: .0517,
  passiveLow: .0692, passiveHigh: .07, passiveHealth: .0517,
} as const;

export function boundedNumber(value: unknown, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

export function calculateGuideInsurance(profitInput: number, salaryInput: number, hoursInput: number) {
  const f = NI_2026;
  const profit = boundedNumber(profitInput, 100000);
  const salary = boundedNumber(salaryInput, 100000);
  const hours = boundedNumber(hoursInput, 80);
  const qualifies = hours >= f.fullHours || profit >= f.definitionIncome ||
    (hours >= f.combinedHours && profit >= f.combinedIncome);
  const reducedRemaining = Math.max(0, f.reducedCeiling - salary);
  const capRemaining = Math.max(0, f.maximumIncome - salary);
  let base: number;
  let adjustment = 0;
  if (qualifies) {
    // Solve x + 52% * nationalInsurance(x) = profit; health is not deductible.
    // Pension deductions and special statuses are outside this illustration.
    let low = 0, high = profit;
    for (let i = 0; i < 60; i++) {
      const x = (low + high) / 2;
      const capped = Math.min(x, capRemaining);
      const lower = Math.min(capped, reducedRemaining);
      const ni = lower * f.selfLow + (capped - lower) * f.selfHigh;
      if (x + f.deduction * ni > profit) high = x;
      else low = x;
    }
    const adjusted = (low + high) / 2;
    adjustment = profit - adjusted;
    base = Math.min(capRemaining, Math.max(adjusted, salary === 0 ? f.minimumSelfIncome : 0));
  } else {
    base = Math.min(capRemaining, Math.max(0, profit - f.exemptIncome));
  }
  const lowerBase = Math.min(base, reducedRemaining);
  const upperBase = Math.max(0, base - lowerBase);
  const lowerRate = qualifies ? f.selfLow + f.healthLow : f.passiveLow + f.passiveHealth;
  const upperRate = qualifies ? f.selfHigh + f.healthHigh : f.passiveHigh + f.passiveHealth;
  const contribution = lowerBase * lowerRate + upperBase * upperRate;
  const minimumTopUp = !qualifies && salary === 0 ? Math.max(0, f.minimumNonWorker - contribution) : 0;
  return { profit, salary, hours, qualifies, base, adjustment, lowerBase, upperBase,
    lowerRate, upperRate, reducedRemaining, capRemaining, minimumTopUp,
    minimumSelfApplied: qualifies && salary === 0 && base === f.minimumSelfIncome,
    total: Math.round((contribution + minimumTopUp) * 100) / 100 };
}
