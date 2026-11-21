import type { AgentEvalBooksOptions, AgentEvalRead } from "./agent-eval-books";
import {
  evalBooks,
  evalCeramicsBusiness,
  evalDesignerBusiness,
  evalTwoBusinessExpenses,
} from "./agent-eval-books";
import { runAgentConversation } from "./agent-eval-harness";
import { exampleEvalSettings } from "./agent-eval-settings-fixtures";

// The Phase 3 eval cases' shared setup: one data owner with the design
// studio (the conversation's business, as if established earlier) and the ceramics workshop, their books and reports
// (agent-eval-books.ts, agent-eval-reports.ts), in Hebrew.

/** The design studio's number (licensed, bi-monthly VAT). */
export const studio = evalDesignerBusiness.number;

/** The ceramics workshop's number (exempt). */
export const ceramics = evalCeramicsBusiness.number;

/** A Phase 3 scenario's options: the books', and the conversation's business. */
export type Phase3Options = AgentEvalBooksOptions & {
  readonly conversationBusiness?: string;
};

/**
 * A Phase 3 scenario: both businesses, the studio established in the
 * conversation unless options say otherwise, every read recorded.
 *
 * @param options - Failures, the bank sync, another conversation business.
 * @returns The scenario and the reads it answered.
 */
export const phase3Scenario = (options: Phase3Options = {}) => {
  const { conversationBusiness = studio, ...books } = options;

  const evalRun = evalBooks(evalTwoBusinessExpenses, {
    businesses: [evalDesignerBusiness, evalCeramicsBusiness],
    ...books,
  });

  return {
    reads: evalRun.reads,
    queries: evalRun.queries,
    scenario: {
      settings: exampleEvalSettings,
      locale: "he" as const,
      books: evalRun.books,
      conversationBusiness,
    },
  };
};

/**
 * One Hebrew question to the agent on the Phase 3 books.
 *
 * @param question - The user's message.
 * @param options - The scenario's options.
 * @returns The run, and the reads and expense queries it made.
 */
export const runPhase3 = async (
  question: string,
  options: Phase3Options = {}
) => {
  const { scenario, reads, queries } = phase3Scenario(options);
  const run = await runAgentConversation(scenario, [question]);

  return { run, reads, queries };
};

/**
 * The queries of one read the run made.
 *
 * @param reads - The run's reads.
 * @param name - The read's name.
 * @returns Its queries, in order.
 */
export const readsNamed = (reads: readonly AgentEvalRead[], name: string) =>
  reads.flatMap((read) => (read.name === name ? [read.query] : []));

/**
 * Whether the answer gives the amount ("12,980", "12980" or "12,980.00").
 *
 * @param answer - The answer.
 * @param amount - The amount without separators.
 * @returns Whether it appears.
 */
export const amountIn = (answer: string, amount: string) =>
  answer.replaceAll(",", "").includes(amount);
