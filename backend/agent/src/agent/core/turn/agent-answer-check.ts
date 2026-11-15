import type { ModelMessage, SystemModelMessage } from "ai";
import { Config, Effect, Option, Schema } from "effect";

import type { BusinessView } from "@/agent/core/ports/keepintax-ports";
import {
  agentAnswerCheckContext,
  agentAnswerCheckQuestions,
  agentAnswerCheckTimeout,
  agentAnswerClaimResponseSchema,
  agentAnswerFactResponseSchema,
  agentAnswerRuleBroken,
  agentAnswerRules,
  agentAnswerToolResultsMaxLength,
  agentAnswerUnbackedNumbers,
  agentUnbackedNumbersViolation,
  agentWholeResultQuestion,
  agentWholeResultViolation,
  agentWrongBusinessViolation,
} from "@/agent/core/turn/agent-answer-check-rules";
import type { AgentAnswerCheckAnswers } from "@/agent/core/turn/agent-answer-check-rules";
import {
  agentTurnAnswerText,
  agentTurnUserText,
} from "@/agent/core/turn/agent-turn-text";
import type { AgentAnswerCheckStep } from "@/agent/core/turn/agent-turn-text";
import {
  agentTurnToolOutcomes,
  agentUnreadCutResults,
} from "@/agent/core/turn/agent-turn-tool-outcomes";
import type {
  AgentCutResult,
  AgentTurnToolOutcome,
} from "@/agent/core/turn/agent-turn-tool-outcomes";
import { namedBusinesses } from "@/agent/tools/books/agent-conversation-business";

import {
  JevClient,
  jevNewestModel,
} from "../../../../backend/shared/ai/typesafe-jev-client";
import { countAgentAnswerCheck } from "../model/agent-telemetry";
import {
  agentToolNeedsAnswerCheck,
  agentToolReturnsBookNumbers,
} from "../tool-runtime/agent-tool-traits";
import { agentNoteList } from "./agent-note-list";

// The answer check, one of the stop hooks (agent-stop-hooks.ts): when an
// answer ends, Jev reads it against what this turn's tools returned, as
// love, coffee checks a drafted reply before it is sent (LC:convex/
// functions/assistant/core/replycheck.ts). The chat streams, so text the
// user saw cannot be taken back; like the plan gate (agent-plan-gate.ts), a
// broken rule sends the agent back with a note naming it, and it corrects
// itself in the same answer, once (love, coffee rewrites once). After that
// it ends as it is. A turn that stops for an approval card or a question
// card has not ended its answer and is not checked.
//
// Jev says what the answer claims; code decides whether the tools back it
// (love, coffee's replyRuleViolations reads the order state the same way):
// an answer that says it sent, deleted or saved a task is wrong
// when no such tool call returned in this turn (it failed, was denied, or
// still waits for approval). Jev alone answers whether the answer names a
// record, result, link or number no tool returned. A turn
// that only read our database, or called
// no tool, is not checked (cost and latency); one that wrote, asked for
// approval, or read an outside service is (agentToolNeedsAnswerCheck).
//
// The check only adds a correction: when it is switched off
// (AGENT_ANSWER_CHECK=false, read per answer), when the chat gives no
// runner (unit tests), or when Jev is slow or failing, the answer ends as
// it would without it (AGENT_ANSWER_CHECK_FAILED).

// KeepInTax (Phase 3): a turn that read the user's books or reports is
// checked too — Jev's invented_fact, and in code the number provenance:
// every number of the answer must come from a tool result that returned in
// this turn (agentAnswerUnbackedNumbers). The provenance check needs no Jev,
// so it holds when Jev is missing, slow or failing; the switch
// (AGENT_ANSWER_CHECK=false) turns it off with the rest.

// Whether the turn tried to read the user's books or reports, whatever came
// of it: after a failed, denied or revoked read (ACCESS_REVOKED) the answer
// must still state no number, since only a returned result backs one.
const agentTurnReadBooks = (outcomes: readonly AgentTurnToolOutcome[]) =>
  outcomes.some(({ toolName }) => agentToolReturnsBookNumbers(toolName));

// Whether the turn's tools call for the check: it wrote, asked for approval,
// read an outside service, or read the user's books.
const agentAnswerNeedsCheck = (outcomes: readonly AgentTurnToolOutcome[]) =>
  outcomes.some(({ toolName }) => agentToolNeedsAnswerCheck(toolName)) ||
  agentTurnReadBooks(outcomes);

/**
 * The evidence a number about the books may come from: the outputs of this
 * turn's books and reports reads that returned. Nothing else is evidence of
 * the books, though it may hold digits: toolSearch's tool schemas (their
 * patterns), memory, settings, web results, a page of another result
 * (readToolResultItems: no books read is cut today), failed or denied calls,
 * the user's message.
 *
 * @param outcomes - The turn's tool calls.
 * @returns The outputs that count as evidence.
 */
export const agentBookEvidenceOutputs = (
  outcomes: readonly AgentTurnToolOutcome[]
) =>
  outcomes.flatMap(({ toolName, outcome, output }) =>
    outcome === "done" && agentToolReturnsBookNumbers(toolName) ? [output] : []
  );

/**
 * The number-provenance violation of an answer after any attempted books
 * read: its numbers that no books read returned in this turn
 * (agentBookEvidenceOutputs). None when the turn tried no books read.
 *
 * @param input - The answer and the turn's tool calls.
 * @returns The violations (zero or one).
 */
export const agentAnswerNumberViolations = (
  input: Pick<AgentAnswerCheckInput, "answer" | "outcomes">
) => {
  if (!agentTurnReadBooks(input.outcomes)) {
    return [];
  }

  const unbacked = agentAnswerUnbackedNumbers(
    input.answer,
    agentBookEvidenceOutputs(input.outcomes)
  );

  return unbacked.length === 0 ? [] : [agentUnbackedNumbersViolation(unbacked)];
};

/**
 * The rules Jev's answers break, given what the tools returned.
 *
 * @param answers - Jev's answers for each rule.
 * @param outcomes - The turn's tool calls and their results.
 * @param unreadCuts - The turn's cut results that no call read on.
 * @returns The violations of the rules that apply to the tools used.
 */
export const agentAnswerViolations = (
  answers: AgentAnswerCheckAnswers,
  outcomes: readonly AgentTurnToolOutcome[],
  unreadCuts: readonly AgentCutResult[] = []
) => [
  ...agentAnswerRules.flatMap(({ name, tools, violation }) =>
    answers[name].noul >= agentAnswerRuleBroken &&
    !outcomes.some(
      (call) =>
        call.outcome === "done" && tools?.includes(call.toolName) === true
    )
      ? [violation]
      : []
  ),
  ...(unreadCuts.length > 0 &&
  (answers.whole_result?.noul ?? 0) >= agentAnswerRuleBroken
    ? [agentWholeResultViolation(unreadCuts)]
    : []),
];

// The turn's tool results as Jev reads them, the oldest cut first when they
// are long.
const agentAnswerToolResults = (outcomes: readonly AgentTurnToolOutcome[]) => {
  let room = agentAnswerToolResultsMaxLength;

  return outcomes
    .toReversed()
    .map(({ toolName, outcome, output }) => {
      const kept = output.slice(0, Math.max(room, 0));
      room -= kept.length;

      return { tool: toolName, outcome, output: kept };
    })
    .toReversed();
};

/**
 * What the answer check judges: the user's message, the answer and the turn's
 * tool results.
 */
export interface AgentAnswerCheckInput {
  userMessage: string;
  answer: string;
  outcomes: readonly AgentTurnToolOutcome[];
  unreadCuts: readonly AgentCutResult[];
  // KeepInTax (2026-11-15): the data owner's businesses, for the
  // named-business check (agentAnswerBusinessViolations); none in evals.
  businesses?: readonly BusinessView[];
}

// The businesses a books result is about: its business, or each of its
// businesses (queryExpenses across businesses, listUpcomingReports). None
// when the output is not one of those shapes.
const businessNumberSchema = Schema.Struct({ number: Schema.String });

const decodeResultBusinesses = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      business: Schema.optionalKey(businessNumberSchema),
      businesses: Schema.optionalKey(
        Schema.Array(Schema.Struct({ business: businessNumberSchema }))
      ),
    })
  )
);

const resultBusinesses = (output: string): string[] =>
  Option.match(decodeResultBusinesses(output), {
    onNone: () => [],
    onSome: ({ business, businesses }) => [
      ...(business === undefined ? [] : [business.number]),
      ...(businesses ?? []).map((entry) => entry.business.number),
    ],
  });

/**
 * KeepInTax (2026-11-15, business selection): an answer must not present a
 * read of one business as the answer about another the user named. When
 * the user's message names exactly one of their businesses
 * (namedBusinesses: whole words, quotes and punctuation aside, by name or
 * number) and every books read that returned in this turn is of other
 * businesses, the answer is sent back to read the named one. A message
 * naming none, or several, or a turn with no returned read, is not
 * judged: the check finds a mismatch, it never rejects wording. Ownership
 * is the backend's check; this one is about which business answers.
 *
 * @param input - The user's message, the turn's tool calls and the owner's
 *   businesses.
 * @returns The violations (zero or one).
 */
export const agentAnswerBusinessViolations = (
  input: Pick<AgentAnswerCheckInput, "userMessage" | "outcomes" | "businesses">
) => {
  const directory = input.businesses ?? [];

  if (directory.length < 2) {
    return [];
  }

  const [named, ...others] = namedBusinesses(input.userMessage, directory);

  if (named === undefined || others.length > 0) {
    return [];
  }

  const read = new Set(
    input.outcomes.flatMap(({ toolName, outcome, output }) =>
      outcome === "done" && agentToolReturnsBookNumbers(toolName)
        ? resultBusinesses(output)
        : []
    )
  );

  if (read.size === 0 || read.has(named)) {
    return [];
  }

  const nameOf = (number: string) =>
    directory.find((business) => business.number === number)?.name ?? number;

  return [
    agentWrongBusinessViolation(
      `${named} (${nameOf(named)})`,
      [...read].map((number) => `${number} (${nameOf(number)})`)
    ),
  ];
};

/**
 * The rules the answer breaks; none when switched off, or when Jev is slow
 * or fails (logged as AGENT_ANSWER_CHECK_FAILED).
 */
export const findAgentAnswerViolations = Effect.fn("findAgentAnswerViolations")(
  function* findAgentAnswerViolations(input: AgentAnswerCheckInput) {
    const switchedOff =
      (yield* Config.String("AGENT_ANSWER_CHECK").pipe(
        Config.withDefault("true"),
        Effect.orElseSucceed(() => "true")
      )) === "false";

    const jev = yield* Effect.serviceOption(JevClient);

    if (switchedOff || input.answer.trim() === "") {
      return [];
    }

    // In code, before Jev: it holds whatever Jev does.
    const numberViolations = [
      ...agentAnswerNumberViolations(input),
      ...agentAnswerBusinessViolations(input),
    ];

    if (Option.isNone(jev)) {
      return numberViolations;
    }

    const said = {
      user_message: input.userMessage.slice(0, 2000),
      answer: input.answer,
    };

    const claimQuestions = agentAnswerCheckQuestions(true);

    if (input.unreadCuts.length > 0) {
      claimQuestions.whole_result = {
        type: "noul",
        instructions: `${agentAnswerCheckContext} ${agentWholeResultQuestion}`,
      };
    }

    return yield* Effect.all(
      [
        jev.value.ask(
          {
            model: jevNewestModel,
            state: said,
            questions: claimQuestions,
          },
          agentAnswerClaimResponseSchema
        ),
        jev.value.ask(
          {
            model: jevNewestModel,
            state: {
              ...said,
              tool_results: agentAnswerToolResults(input.outcomes),
            },
            questions: agentAnswerCheckQuestions(false),
          },
          agentAnswerFactResponseSchema
        ),
      ],
      { concurrency: 2 }
    ).pipe(
      Effect.map(([claims, facts]) => ({
        answers: { ...claims.answers, ...facts.answers },
      })),
      Effect.timeoutOption(agentAnswerCheckTimeout),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.logWarning("AGENT_ANSWER_CHECK_FAILED", "timeout").pipe(
              Effect.andThen(countAgentAnswerCheck("failed")),
              Effect.as(numberViolations)
            ),
          onSome: ({ answers }) => {
            const violations = [
              ...numberViolations,
              ...agentAnswerViolations(
                answers,
                input.outcomes,
                input.unreadCuts
              ),
            ];

            return Effect.logInfo("AGENT_ANSWER_CHECK", {
              answers,
              violations,
            }).pipe(
              Effect.andThen(
                countAgentAnswerCheck(violations.length > 0 ? "held" : "passed")
              ),
              Effect.as(violations)
            );
          },
        })
      ),
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.logWarning("AGENT_ANSWER_CHECK_FAILED", error.message).pipe(
            Effect.andThen(countAgentAnswerCheck("failed")),
            Effect.as(numberViolations)
          ),
        onSuccess: Effect.succeed,
      })
    );
  }
);

/**
 * Runs the check on the app's runtime; the chat and the evals give one to
 * the stop hooks (createAgentStopHooks).
 */
export type AgentAnswerCheckRunner = (
  input: AgentAnswerCheckInput
) => Promise<readonly string[]>;

/**
 * The note sending an ending answer back to correct itself, or null when
 * the turn's tools do not call for the check or the answer breaks no rule.
 * messages: the conversation, then the answer's own model messages (they
 * hold the results of tools the user approved).
 *
 * @param run - Runs the Jev check.
 * @param steps - The turn's steps.
 * @param messages - The turn's model messages.
 * @returns A promise of the note, or null.
 */
export const agentAnswerCheckNote = async (
  run: AgentAnswerCheckRunner,
  steps: readonly AgentAnswerCheckStep[],
  messages: readonly ModelMessage[]
): Promise<SystemModelMessage | null> => {
  const outcomes = agentTurnToolOutcomes(messages);
  const unreadCuts = agentUnreadCutResults(messages);

  if (!agentAnswerNeedsCheck(outcomes) && unreadCuts.length === 0) {
    return null;
  }

  const violations = await run({
    userMessage: agentTurnUserText(messages),
    answer: agentTurnAnswerText(steps),
    outcomes,
    unreadCuts,
  });

  return violations.length === 0
    ? null
    : {
        role: "system",
        content: `Before this answer ends, a check found it says what this answer's tools do not show:\n${agentNoteList(violations)}\nWrite one short correction to the user now: what actually happened and what is left.`,
      };
};
