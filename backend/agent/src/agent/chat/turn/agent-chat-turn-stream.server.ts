import {
  convertToModelMessages,
  createUIMessageStream,
  toUIMessageStream,
} from "ai";
import type { LanguageModelUsage, ModelMessage, StepResult } from "ai";

import type { AgentChatAnswerFailure } from "@/agent/chat/turn/agent-chat-errors";
import type { AgentChatUserSteers } from "@/agent/chat/turn/agent-chat-user-steers.server";
import type { createAppAgent } from "@/agent/core/agent/app-agent";
import type { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";
import { agentAnswerAsksUser } from "@/agent/core/turn/agent-follow-up-questions";
import { agentTurnEndedAnswer } from "@/agent/core/turn/agent-stop-hooks";
import type { createAgentStopHooks } from "@/agent/core/turn/agent-stop-hooks";
import {
  agentTurnAnswerText,
  agentTurnUserText,
} from "@/agent/core/turn/agent-turn-text";
import type {
  AgentChatMessage,
  AgentChatMessageMetadata,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

// One answer of the chat as a UI message stream: the agent runs, the stop
// hooks (agent-stop-hooks.ts) may send it back with a note, and it runs
// again in the same message. Its follow-up questions are written after the
// answer has ended and been saved (agent-follow-up-questions.ts, onEnd's
// followUps), so the answer does not wait 3 to 5 s for them (every answer
// of the 2026-10-17 benchmark that had them); a transient
// data-followUpsPending tells the page to fetch them. The AI SDK's
// createAgentUIStream runs the agent once, so the runs are joined here: the
// first sends the message's start.

interface AgentChatTurnInput {
  agent: ReturnType<typeof createAppAgent>;
  // The conversation as the model reads it (agentChatModelHistory).
  history: AgentChatMessage[];
  // The stored conversation the answer adds to or continues.
  originalMessages: AgentChatMessage[];
  abortSignal: AbortSignal;
  // The start's metadata (a new answer's createdAt); none when the answer
  // continues after the user's approvals.
  startMetadata: AgentChatMessageMetadata | undefined;
  // The finish's metadata, when the answer ends.
  finishMetadata: () => AgentChatMessageMetadata;
  stopHooks: ReturnType<typeof createAgentStopHooks>;
  onStepEnd: (usage: LanguageModelUsage) => void;
  // followUps: what the follow-up questions are written from, when the
  // answer gets them (it ended, asking the user nothing).
  onEnd: (
    responseMessage: AgentChatMessage,
    followUps: AgentChatFollowUpsSource | null
  ) => PromiseLike<void> | void;
  onError: (error: AgentChatAnswerFailure) => string;
  // What the user wrote into the answer, read by the agent's steps; none in
  // tests.
  userSteers?: Pick<AgentChatUserSteers, "takeUnshown" | "placeInRun">;
}

/**
 * What an answer's follow-up questions are written from.
 */
export interface AgentChatFollowUpsSource {
  userMessage: string;
  answer: string;
}

/**
 * Streams one turn of the agent's answer as UI messages, with follow-up
 * questions, the answer check and the stop hooks wired in.
 *
 * @param input - The turn: the agent, its history and its callbacks.
 * @returns A promise of the UI message stream.
 */
export const streamAgentChatTurn = async (input: AgentChatTurnInput) => {
  const conversation = await convertToModelMessages(input.history, {
    tools: input.agent.tools,
  });

  let followUps: AgentChatFollowUpsSource | null = null;

  return createUIMessageStream<AgentChatMessage>({
    originalMessages: input.originalMessages,
    generateId: () => crypto.randomUUID(),
    onError: input.onError,
    onEnd: ({ responseMessage }) => input.onEnd(responseMessage, followUps),
    execute: async ({ writer }) => {
      const steps: StepResult<typeof appAgentTools>[] = [];

      // One run answers the turn so far, streaming into the message; a
      // hook's note sends it to the next run, so the runs go one at a time.
      // The turn's messages once no hook sends it back, or null when the
      // answer was stopped or failed.
      const runAnswer = async (
        prompt: ModelMessage[],
        run: number
      ): Promise<ModelMessage[] | null> => {
        const result = await input.agent.stream({
          prompt,
          abortSignal: input.abortSignal,
          onStepEnd: ({ usage }) => {
            input.onStepEnd(usage);
          },
        });

        let stopped = false;

        for await (const chunk of toUIMessageStream<
          typeof appAgentTools,
          AgentChatMessage
        >({
          stream: result.stream,
          originalMessages: input.originalMessages,
          generateMessageId: () => crypto.randomUUID(),
          sendStart: run === 0,
          sendFinish: false,
          messageMetadata: ({ part }) =>
            part.type === "start" ? input.startMetadata : undefined,
          onError: input.onError,
        })) {
          stopped ||= chunk.type === "error" || chunk.type === "abort";

          // The steers a step read go in just before it, where the model
          // read them: prepareStep took them before the step started.
          if (chunk.type === "start-step") {
            for (const steer of input.userSteers?.takeUnshown() ?? []) {
              writer.write({
                type: "data-userSteer",
                id: steer.id,
                data: steer,
              });
            }
          }

          writer.write(chunk);
        }

        if (stopped) {
          return null;
        }

        steps.push(...(await result.steps));

        // Every step's messages, and the results of tools the user approved
        // before the first: since AI SDK 7 a step's response.messages hold
        // that step's alone, so the check and a run a hook sends back need
        // the run's whole responseMessages.
        const responseMessages = await result.responseMessages;

        const messages = [
          ...prompt,
          ...(input.userSteers?.placeInRun(responseMessages) ??
            responseMessages),
        ];

        const note = await input.stopHooks(steps, messages);

        if (note === null) {
          return messages;
        }

        // Saved with the answer where it came, so later turns read the
        // note too (agentChatModelHistory), as the checks' messages stay in
        // the conversation in Claude Code and Codex.
        writer.write({
          type: "data-agentNote",
          data: { text: note.content },
        });

        return await runAnswer([...messages, note], run + 1);
      };

      const prompt = await runAnswer(conversation, 0);

      if (prompt === null) {
        writer.write({
          type: "finish",
          messageMetadata: input.finishMetadata(),
        });

        return;
      }

      const answer = agentTurnAnswerText(steps);

      if (agentTurnEndedAnswer(steps) && !agentAnswerAsksUser(answer)) {
        followUps = { userMessage: agentTurnUserText(prompt), answer };
        writer.write({
          type: "data-followUpsPending",
          data: {},
          transient: true,
        });
      }

      writer.write({ type: "finish", messageMetadata: input.finishMetadata() });
    },
  });
};
