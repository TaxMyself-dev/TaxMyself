import { calculateGuideInsurance } from './guide-national-insurance';
import { SELF_EMPLOYED_GUIDE_FIGURES } from './self-employed-guide.figures';
import { STUDY_LIMITS } from './guide-study-comparison';

export interface TaxFilePlanningInput {
  actualIncome: number;
  actualExpenses: number;
  actualProfit: number;
  yearProgress: number;
  monthlySalary: number;
  creditPoints: number;
  incomeTaxPaid?: number | null;
  nationalInsurancePaid?: number | null;
  nationalInsuranceRequired?: boolean | null;
}

export interface TaxFilePlanningResult {
  projectedIncome: number;
  projectedExpenses: number;
  projectedProfit: number;
  annualSalary: number;
  combinedIncome: number;
  incomeTax: number;
  estimatedSalaryTax: number;
  incomeTaxBalance: number | null;
  nationalInsurance: number;
  nationalInsuranceBalance: number | null;
  totalKnownBalance: number | null;
  marginalRate: number;
  studyFundTarget: number;
  studyFundTaxSaving: number;
}

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export function calculateAnnualIncomeTax(incomeInput: number, creditPointsInput = 2.25): number {
  const income = safeNumber(incomeInput);
  const creditPoints = safeNumber(creditPointsInput);
  let tax = 0;
  let lowerBound = 0;

  for (const bracket of SELF_EMPLOYED_GUIDE_FIGURES.incomeTaxBrackets) {
    const upperBound = bracket.upperBound ?? income;
    const taxableInBracket = Math.max(0, Math.min(income, upperBound) - lowerBound);
    tax += taxableInBracket * bracket.rate;
    if (bracket.upperBound === null || income <= upperBound) break;
    lowerBound = upperBound;
  }

  const credits = creditPoints * SELF_EMPLOYED_GUIDE_FIGURES.annualCreditPointValue;
  return Math.max(0, Math.round(tax - credits));
}

export function currentMarginalRate(incomeInput: number): number {
  const income = safeNumber(incomeInput);
  return SELF_EMPLOYED_GUIDE_FIGURES.incomeTaxBrackets.find(
    bracket => bracket.upperBound === null || income <= bracket.upperBound,
  )?.rate ?? 0;
}

export function calculateTaxFilePlanning(input: TaxFilePlanningInput): TaxFilePlanningResult {
  const progress = Math.min(1, Math.max(1 / 12, safeNumber(input.yearProgress)));
  const projectedIncome = safeNumber(input.actualIncome) / progress;
  const projectedExpenses = safeNumber(input.actualExpenses) / progress;
  // Prefer the report's own net-profit figure. It already applies accounting
  // recognition percentages and is therefore safer than gross subtraction.
  const projectedProfit = safeNumber(input.actualProfit) / progress;
  const annualSalary = safeNumber(input.monthlySalary) * 12;
  const combinedIncome = projectedProfit + annualSalary;
  const incomeTax = calculateAnnualIncomeTax(combinedIncome, input.creditPoints);
  const estimatedSalaryTax = calculateAnnualIncomeTax(annualSalary, input.creditPoints);
  const incomeTaxBalance = input.incomeTaxPaid == null
    ? null
    : Math.max(0, incomeTax - estimatedSalaryTax - safeNumber(input.incomeTaxPaid));

  const monthlyInsurance = calculateGuideInsurance(
    projectedProfit / 12,
    safeNumber(input.monthlySalary),
    input.nationalInsuranceRequired === true ? 20 : 0,
    input.nationalInsuranceRequired ?? undefined,
  );
  const nationalInsurance = Math.round(monthlyInsurance.total * 12);
  const nationalInsuranceBalance = input.nationalInsurancePaid == null
    ? null
    : Math.max(0, nationalInsurance - safeNumber(input.nationalInsurancePaid));
  const totalKnownBalance = incomeTaxBalance == null || nationalInsuranceBalance == null
    ? null
    : incomeTaxBalance + nationalInsuranceBalance;

  const marginalRate = currentMarginalRate(combinedIncome);
  const studyFundTarget = Math.round(Math.min(
    STUDY_LIMITS.exemptDeposit,
    projectedProfit * 0.07,
  ));
  const deductibleStudyFund = Math.min(
    STUDY_LIMITS.deduction,
    projectedProfit * 0.045,
    studyFundTarget,
  );

  return {
    projectedIncome: Math.round(projectedIncome),
    projectedExpenses: Math.round(projectedExpenses),
    projectedProfit: Math.round(projectedProfit),
    annualSalary: Math.round(annualSalary),
    combinedIncome: Math.round(combinedIncome),
    incomeTax,
    estimatedSalaryTax,
    incomeTaxBalance,
    nationalInsurance,
    nationalInsuranceBalance,
    totalKnownBalance,
    marginalRate,
    studyFundTarget,
    studyFundTaxSaving: Math.round(deductibleStudyFund * marginalRate),
  };
}
