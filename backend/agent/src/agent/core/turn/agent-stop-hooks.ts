import type { ModelMessage, SystemModelMessage } from "ai";

import { recordAgentTurnGate } from "../model/agent-telemetry";
import { agentAnswerCheckNote } from "./agent-answer-check";
import type { AgentAnswerCheckRunner } from "./agent-answer-check";
import {
  agentOpenPlanSteps,
  agentPlanGateNote,
  agentPlanGateReminders,
} from "./agent-plan-gate";
import {
  agentToolSearchEnding,
  agentToolSearchNotes,
} from "./agent-turn-gates";

// The stop hooks: what runs when an answer ends, as Codex's and Claude
// Code's stop hooks run when the agent stops. An answer ends when the
// agent's last step wrote text and called no tool (the AI SDK's own end of
// the loop). A hook may send it back with a note: the plan gate while the
// plan has open steps (agent-plan-gate.ts, twice at most), then the turn
// gates once each (agent-turn-gates.ts), then the answer check once
// (agent-answer-check.ts). The chat and the evals run the agent
// again on the turn's messages and the note, in the same answer; once no
// hook sends it back, the answer has ended and its follow-up questions are
// written (agent-follow-up-questions.ts). A turn that stops for an approval
// card, a question card (askUserQuestion) or the step limit has not ended
// its answer, and no hook runs.
//
// An empty reply (the last step wrote nothing and called no tool) is a
// failed model call, not an answer (DeepSeek's EMPTY_RESPONSE): it is sent
// back to answer, at most agentEmptyReplyRetries times; after that the
// answer ends as it is.

export const agentEmptyReplyRetries = 2;

const agentEmptyReplyNote: SystemModelMessage = {
  role: "system",
  content:
    "Your last reply was empty. Answer the user now: what you found and did, and what is left.",
};

// One finished step of the answer, as the AI SDK records it.
interface AgentStopHookStep {
  text: string;
  toolCalls: readonly {
    toolName: string;
    input: unknown;
    providerExecuted?: boolean;
  }[];
  toolResults?: readonly { toolName: string; output: unknown }[];
}

// The step's calls our side runs: a call OpenAI ran itself (the hosted tool
// search) leaves nothing to execute, so the answer ends after it, and a
// step with only such a call and no text is an empty reply.
const agentClientToolCalls = (step: AgentStopHookStep) =>
  step.toolCalls.filter((call) => call.providerExecuted !== true);

/**
 * Whether the turn ended its answer: its last step wrote text and called no
 * tool.
 *
 * @param steps - The turn's steps.
 * @returns Whether the last step ended the answer.
 */
export const agentTurnEndedAnswer = (steps: readonly AgentStopHookStep[]) => {
  const last = steps.at(-1);

  return (
    last !== undefined &&
    agentClientToolCalls(last).length === 0 &&
    last.text.trim() !== ""
  );
};

/**
 * The hooks of one answer, made per request: each call takes every step of
 * the answer so far and its model messages (the conversation, then the
 * answer's own), and returns the note to go on with, or null when the
 * answer may end. checkAnswer: none in unit tests, and no answer is checked.
 *
 * @param checkAnswer - Runs the answer check; without it no answer is checked.
 * @returns The stop hooks' runner.
 */
export const createAgentStopHooks = (checkAnswer?: AgentAnswerCheckRunner) => {
  let planReminders = 0;
  let answerChecked = false;
  let emptyReplies = 0;
  let toolSearchGated = false;

  return async function runAgentStopHooks(
    steps: readonly AgentStopHookStep[],
    messages: readonly ModelMessage[]
  ): Promise<SystemModelMessage | null> {
    const last = steps.at(-1);

    if (
      last !== undefined &&
      agentClientToolCalls(last).length === 0 &&
      last.text.trim() === "" &&
      emptyReplies < agentEmptyReplyRetries
    ) {
      emptyReplies += 1;

      return agentEmptyReplyNote;
    }

    if (!agentTurnEndedAnswer(steps)) {
      return null;
    }

    const open = agentOpenPlanSteps(steps);

    if (open.length > 0 && planReminders < agentPlanGateReminders) {
      planReminders += 1;

      return agentPlanGateNote(open);
    }

    const searchEnding = toolSearchGated ? null : agentToolSearchEnding(steps);

    if (searchEnding !== null) {
      toolSearchGated = true;
      recordAgentTurnGate(`${searchEnding}_tool_search`);

      return agentToolSearchNotes[searchEnding];
    }

    // Add your own turn gates here (agent-turn-gates.ts): a shape of
    // mistake code can see in the turn's tool calls, sent back once with a
    // note on what to do instead.

    if (checkAnswer === undefined || answerChecked) {
      return null;
    }

    answerChecked = true;

    return await agentAnswerCheckNote(checkAnswer, steps, messages);
  };
};
