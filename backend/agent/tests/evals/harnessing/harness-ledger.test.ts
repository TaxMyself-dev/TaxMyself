import { assert, describe, it } from "@effect/vitest";

import {
  assertHarnessLedgerIdentity,
  createHarnessLedger,
  harnessLedgerRemainingUsd,
} from "./harness-ledger";

// The harnessing ledger: the proposer's budget is shared by every task and
// no session starts once it is spent; a mode spends exactly 4k rollouts and
// 3k stages.

describe("harness ledger", () => {
  it("what is left is the cap less every task's spend", () => {
    const budget = { capUsd: 10, spentUsd: 0 };
    const first = createHarnessLedger(budget);
    const second = createHarnessLedger(budget);

    first.budget.spentUsd += 2.5;
    second.budget.spentUsd += 3.25;

    // 10 - 2.5 - 3.25
    assert.strictEqual(harnessLedgerRemainingUsd(first), 4.25);
  });

  it("at the cap no session may start", () => {
    const ledger = createHarnessLedger({ capUsd: 10, spentUsd: 10 });

    assert.throws(() => {
      harnessLedgerRemainingUsd(ledger);
    }, /HARNESS_BUDGET_SPENT: the proposer spent \$10\.00 of the \$10\.00 cap/u);
  });

  it("just under the cap a session may still start", () => {
    const ledger = createHarnessLedger({ capUsd: 10, spentUsd: 9.99 });

    assert.closeTo(harnessLedgerRemainingUsd(ledger), 0.01, 1e-9);
  });

  it("k=1 is exactly 4 rollouts and 3 stages", () => {
    const ledger = createHarnessLedger({ capUsd: 10, spentUsd: 0 });

    ledger.rollouts.push("base1", "inv1", "dom1", "agg1");
    ledger.sessions.push(
      { label: "inv1", usd: 0, attempts: 1 },
      { label: "dom1", usd: 0, attempts: 1 },
      { label: "agg1", usd: 0, attempts: 1 }
    );
    assert.doesNotThrow(() => {
      assertHarnessLedgerIdentity(ledger, 1);
    });

    ledger.rollouts.push("agg1-again");
    assert.throws(() => {
      assertHarnessLedgerIdentity(ledger, 1);
    }, /HARNESS_LEDGER_MISMATCH: 5 rollouts and 3 stages; k=1 schedules 4 and 3/u);
  });
});
