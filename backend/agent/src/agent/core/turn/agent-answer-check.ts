import type { ModelMessage, SystemModelMessage } from "ai";
import { Config, Effect, Option } from "effect";

import {
  agentAnswerCheckContext,
  agentAnswerCheckQuestions,
  agentAnswerCheckTimeout,
  agentAnswerClaimResponseSchema,
  agentAnswerFactResponseSchema,
  agentAnswerRuleBroken,
  agentAnswerRules,
  agentAnswerToolResultsMaxLength,
  agentWholeResultQuestion,
  agentWholeResultViolation,
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

import {
  JevClient,
  jevNewestModel,
} from "../../../../backend/shared/ai/typesafe-jev-client";
import { countAgentAnswerCheck } from "../model/agent-telemetry";
import { agentToolNeedsAnswerCheck } from "../tool-runtime/agent-tool-traits";
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

// Whether the turn's tools call for the check: it wrote, asked for approval,
// or read an outside service.
const agentAnswerNeedsCheck = (outcomes: readonly AgentTurnToolOutcome[]) =>
  outcomes.some(({ toolName }) => agentToolNeedsAnswerCheck(toolName));

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
}

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

    if (switchedOff || Option.isNone(jev) || input.answer.trim() === "") {
      return [];
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
              Effect.as([])
            ),
          onSome: ({ answers }) => {
            const violations = agentAnswerViolations(
              answers,
              input.outcomes,
              input.unreadCuts
            );

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
            Effect.as([])
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
