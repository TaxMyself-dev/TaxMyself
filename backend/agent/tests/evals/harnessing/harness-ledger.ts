import { writeFileSync } from "node:fs";

// The record of what one harnessing task spent (Harness² core/ledger.py):
// every rollout and every proposer session by label, and the proposer's
// cost against the run's cap. A mode schedules exactly 4k rollouts and 3k
// stages, base rollouts included; assertHarnessLedgerIdentity checks it.

/**
 * What the proposer may spend across a whole harnessing run, shared by
 * every task's ledger.
 */
export interface HarnessBudget {
  readonly capUsd: number;
  // Every proposer call's cost, added as it returns.
  spentUsd: number;
}

/**
 * One task's rollouts and stages, and the run's budget.
 */
export interface HarnessLedger {
  readonly budget: HarnessBudget;
  readonly rollouts: string[];
  // One per stage, retries included in its usd and attempts.
  readonly sessions: { label: string; usd: number; attempts: number }[];
}

/**
 * A task's ledger with nothing recorded.
 *
 * @param budget - The run's budget.
 * @returns The ledger.
 */
export const createHarnessLedger = (budget: HarnessBudget): HarnessLedger => ({
  budget,
  rollouts: [],
  sessions: [],
});

/**
 * What the proposer may still spend; throws HARNESS_BUDGET_SPENT when
 * nothing is left, so no session starts past the cap.
 *
 * @param ledger - The ledger.
 * @returns Dollars left.
 */
export const harnessLedgerRemainingUsd = (ledger: HarnessLedger) => {
  const { capUsd, spentUsd } = ledger.budget;
  const remaining = capUsd - spentUsd;

  if (remaining <= 0) {
    throw new Error(
      `HARNESS_BUDGET_SPENT: the proposer spent $${spentUsd.toFixed(2)} of the $${capUsd.toFixed(2)} cap`
    );
  }

  return remaining;
};

/**
 * Checks a finished mode spent exactly 4k rollouts and 3k stages for one
 * task (Harness²'s budget identity); throws HARNESS_LEDGER_MISMATCH.
 *
 * @param ledger - The task's ledger.
 * @param k - The mode's k.
 */
export const assertHarnessLedgerIdentity = (
  ledger: HarnessLedger,
  k: number
) => {
  if (ledger.rollouts.length !== 4 * k || ledger.sessions.length !== 3 * k) {
    throw new Error(
      `HARNESS_LEDGER_MISMATCH: ${ledger.rollouts.length} rollouts and ${ledger.sessions.length} stages; k=${k} schedules ${4 * k} and ${3 * k}`
    );
  }
};

/**
 * Writes the ledger as JSON.
 *
 * @param ledger - The ledger.
 * @param file - Where.
 */
export const writeHarnessLedger = (ledger: HarnessLedger, file: string) => {
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
};
