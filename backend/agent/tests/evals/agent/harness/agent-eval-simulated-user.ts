import { generateText, Output } from "ai";
import { Effect, Schema } from "effect";

import { AgentLanguageModel } from "@/agent/core/model/agent-model";
import { appRuntime } from "@/server/runtime/app-runtime.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import type {
  AgentEvalApprovalRequest,
  AgentEvalConversation,
  AgentEvalRun,
  AgentEvalUserStep,
} from "./agent-eval-harness";
import {
  runAgentEvalStep,
  startAgentEvalConversation,
} from "./agent-eval-harness";
import type { AgentEvalScenario } from "./agent-eval-scenario";

// A simulated user for the agent evals (Design 7 of docs/goals/app-goal.md):
// gpt-6-luna, the agent's own model (the owner's choice, 2026-10-14), plays a
// person with a goal through a whole workflow: short Hebrew, follow-ups,
// approval cards decided as the persona would (denied, or denied with a
// note), until the goal is met or the step limit ends the chat. The opening
// message is fixed, so every run starts the same way; what follows depends
// on the agent's answers, so these cases check the end state (what was
// saved, created, sent) and judge the whole chat, not one wording.
// DeepEval's ConversationSimulator is not used: it calls Confident AI's
// hosted API with its own model.

interface SimulatedAgentUser {
  // Who they are and how they write.
  persona: string;
  // What they want from this chat, and what counts as done.
  goal: string;
  // Their first message.
  opening: string;
  // How they decide approval cards (what to approve, what to deny and why).
  approvals: string;
}

// The most steps (messages and approval decisions) after the opening.
const simulatedUserMaxSteps = 6;

const simulatedUserReplySchema = Schema.Struct({
  done: Schema.Boolean.annotate({
    description:
      "true when the goal is met or the user would leave the chat now",
  }),
  message: Schema.String.annotate({
    description:
      "The user's next chat message, in their voice; empty when done or when deciding approval cards",
  }),
  decisions: Schema.Array(
    Schema.Struct({
      approvalId: Schema.String,
      approved: Schema.Boolean,
      reason: Schema.String.annotate({
        description:
          "A note with a denial, asking for a change; empty for none",
      }),
    })
  ).annotate({
    description:
      "One decision per approval card waiting, when cards wait; otherwise empty",
  }),
});

const simulatedUserTranscript = (
  conversation: AgentEvalConversation,
  waiting: readonly AgentEvalApprovalRequest[]
) =>
  [
    ...conversation.turns.map(
      (turn) =>
        `${turn.role === "user" ? "USER" : "AGENT"}: ${turn.content.replace(/^<message_time>.*<\/message_time>\n?/u, "")}`
    ),
    ...waiting.map(
      (request) =>
        `APPROVAL CARD ${request.approvalId}: ${request.toolName} ${JSON.stringify(request.input)}`
    ),
  ].join("\n\n");

// The user's next step: the cards decided when cards wait, a message, or
// null when they are done.
const nextSimulatedUserStep = async (
  user: SimulatedAgentUser,
  conversation: AgentEvalConversation,
  waiting: readonly AgentEvalApprovalRequest[]
): Promise<AgentEvalUserStep | null> => {
  const model = await appRuntime.runPromise(
    Effect.map(Effect.service(AgentLanguageModel), (language) => language.model)
  );

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: toStandardSchema(simulatedUserReplySchema),
    }),
    instructions: [
      "You play a user of YourApp's agent chat in an evaluation. Stay in character; never mention the evaluation.",
      `Who you are: ${user.persona}`,
      `What you want: ${user.goal}`,
      `Approval cards: ${user.approvals}`,
      "Write as people write in a chat: short, in Hebrew, one thing at a time. Answer what the agent asks. When approval cards wait, decide each one and write no message.",
    ].join("\n"),
    prompt: simulatedUserTranscript(conversation, waiting),
  });

  if (waiting.length > 0) {
    return {
      decisions: waiting.map((request) => {
        const decision = output.decisions.find(
          (made) => made.approvalId === request.approvalId
        );

        return {
          approvalId: request.approvalId,
          approved: decision?.approved ?? false,
          // An empty note is no note.
          reason: decision?.reason === "" ? undefined : decision?.reason,
        };
      }),
    };
  }

  return output.done || output.message.trim() === ""
    ? null
    : { message: output.message };
};

/**
 * A whole chat with a simulated user; the run describes the last answer, and
 * its writes, tool calls and turns cover the chat.
 *
 * @param scenario - The case's fixtures and settings.
 * @param user - The simulated user: their opening and how they answer.
 * @returns A promise of the last answer's run.
 */
export const runSimulatedAgentConversation = async (
  scenario: AgentEvalScenario,
  user: SimulatedAgentUser
): Promise<AgentEvalRun> => {
  // Each step answers the chat so far, until the user is done or the steps
  // run out.
  const continueChat = async (
    { run, conversation }: Awaited<ReturnType<typeof runAgentEvalStep>>,
    stepsLeft: number
  ): Promise<AgentEvalRun> => {
    if (stepsLeft === 0) {
      return run;
    }

    const next = await nextSimulatedUserStep(
      user,
      conversation,
      run.approvalRequests
    );

    return next === null
      ? run
      : await continueChat(
          await runAgentEvalStep(scenario, next, conversation),
          stepsLeft - 1
        );
  };

  return await continueChat(
    await runAgentEvalStep(
      scenario,
      { message: user.opening },
      startAgentEvalConversation(scenario)
    ),
    simulatedUserMaxSteps
  );
};
