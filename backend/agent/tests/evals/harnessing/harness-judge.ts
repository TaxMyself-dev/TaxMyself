import path from "node:path";

import {
  evalResultRowSchema,
  readEvalJsonLines,
} from "../runner/eval-run-records";
import type { HarnessRunView } from "./harness-rollout";

// The eval's verdict on a rollout (Harness² core/judge.py): whether every
// judge and code check of the case passed, from the run's results.jsonl.
// Only run-agent-harnessing.ts calls it, and only after selection has
// committed; nothing the method reads imports this module.

/**
 * The verdict on one rollout: passed, failed, or undefined when the case
 * reached no verdict (an app or judge error is not a failure).
 *
 * @param rollout - The rollout.
 * @returns Whether every check passed.
 */
export const harnessRolloutPassed = (rollout: HarnessRunView) =>
  readEvalJsonLines(
    path.join(rollout.runDir, "results.jsonl"),
    evalResultRowSchema
  ).at(-1)?.passed_all;
