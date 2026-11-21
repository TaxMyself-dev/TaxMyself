import { evalShortHash } from "./eval-run-records";
import type { EvalResultRow } from "./eval-run-records";

// The statistics of an eval run's summary (run-agent-evals.ts): pass rates
// per case with Wilson intervals, the bootstrapped comparison against
// another variant, usage totals, and each case's split.

/**
 * The split a case belongs to, fixed by its id: about two thirds train, which
 * a change to the prompt or tools may be tuned on (its failures read), and a
 * third test, held out to catch overfitting: a change is kept only when the
 * test cases hold too (Anthropic's hillclimbing guidance,
 * "Automating eval design and hillclimbing with Claude", 2026-09-28).
 *
 * @param caseId - The case's id (its group).
 * @returns train or test.
 */
export const evalCaseSplit = (caseId: string): "train" | "test" =>
  Number.parseInt(evalShortHash(caseId).slice(0, 4), 16) % 3 === 0
    ? "test"
    : "train";

const wilson = (passes: number, n: number): [number, number] => {
  const z = 1.96;
  const p = passes / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;

  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;

  return [Math.max(0, centre - half), Math.min(1, centre + half)];
};

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

// Each case's pass rate, its repetitions averaged.
const casePassRates = (
  rows: EvalResultRow[],
  passed: (row: EvalResultRow) => boolean | undefined
) => {
  const byCase = new Map<string, number[]>();

  for (const row of rows) {
    const value = passed(row);

    if (value !== undefined) {
      byCase.set(row.group_id, [
        ...(byCase.get(row.group_id) ?? []),
        Number(value),
      ]);
    }
  }

  return new Map([...byCase].map(([id, values]) => [id, mean(values)]));
};

/**
 * The pass rate over cases with its Wilson interval.
 *
 * @param rows - The run's result rows.
 * @param passed - Whether a row passed; undefined leaves it out.
 * @returns The pass rate, its 95% interval and the number of cases.
 */
export const caseLevel = (
  rows: EvalResultRow[],
  passed: (row: EvalResultRow) => boolean | undefined
) => {
  const rates = [...casePassRates(rows, passed).values()];

  if (rates.length === 0) {
    return { pass_rate: null, ci95: [null, null], n_cases: 0 };
  }

  const passRate = mean(rates);

  return {
    pass_rate: passRate,
    ci95: wilson(passRate * rates.length, rates.length),
    n_cases: rates.length,
  };
};

const compareVerdict = (low: number, high: number) => {
  if (low > 0) {
    return "better";
  }

  return high < 0 ? "worse" : "within noise";
};

/**
 * The paired difference per case against another variant, bootstrapped
 * over cases.
 *
 * @param rows - The candidate run's rows.
 * @param baselineRows - The baseline run's rows.
 * @param baselineVariant - The baseline's variant name.
 * @returns The baseline, the number of cases, the difference with its interval
 *   and verdict, and the cases that flipped to pass or to fail.
 */
export const compareEvalVariants = (
  rows: EvalResultRow[],
  baselineRows: EvalResultRow[],
  baselineVariant: string
) => {
  const candidate = casePassRates(rows, (row) => row.passed_all);
  const baseline = casePassRates(baselineRows, (row) => row.passed_all);

  const shared = [...candidate.keys()]
    .filter((id) => baseline.has(id))
    .toSorted();

  const diffs = shared.map(
    (id) => (candidate.get(id) ?? 0) - (baseline.get(id) ?? 0)
  );

  if (diffs.length === 0) {
    return null;
  }

  const boots = Array.from({ length: 2000 }, () =>
    mean(diffs.map(() => diffs[Math.floor(Math.random() * diffs.length)] ?? 0))
  ).toSorted((a, b) => a - b);

  const low = boots[50] ?? 0;
  const high = boots[1949] ?? 0;

  return {
    baseline: baselineVariant,
    n_cases: shared.length,
    delta: mean(diffs),
    ci95: [low, high],
    verdict: compareVerdict(low, high),
    flipped_to_pass: shared.filter(
      (id) => (candidate.get(id) ?? 0) > (baseline.get(id) ?? 0)
    ),
    flipped_to_fail: shared.filter(
      (id) => (candidate.get(id) ?? 0) < (baseline.get(id) ?? 0)
    ),
  };
};

/**
 * The total of the values that are known, and how many were missing.
 *
 * @param values - The values, some unknown.
 * @returns The total (null when none is known) and the missing count.
 */
export const sumKnown = (values: (number | null | undefined)[]) => {
  const known = values.filter((value) => value !== null && value !== undefined);

  return {
    total:
      known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null,
    missing: values.length - known.length,
  };
};

/**
 * A rate with two decimals, or n/a.
 *
 * @param value - The rate, or null.
 * @returns The text.
 */
export const formatRate = (value: number | null) =>
  value === null ? "n/a" : value.toFixed(2);
