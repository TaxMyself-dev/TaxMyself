import "deepeval/vitest";
import { createHash } from "node:crypto";

import { convertToModelMessages } from "ai";
import type { ModelMessage } from "ai";
import { logHyperparameters } from "deepeval";
import type { ToolCall } from "deepeval/test-case";
import { Turn } from "deepeval/test-case";
import { Effect, Predicate } from "effect";
import { afterAll, vi } from "vitest";

import { agentChatModelHistory } from "@/agent/chat/messages/agent-chat-model-history";
import { agentInstructions } from "@/agent/core/agent/agent-instructions";
import { withAgentUserContext } from "@/agent/core/agent/agent-user-context";
import { agentModelId } from "@/agent/core/model/agent-model";
import { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";
import { agentShortTermHistory } from "@/agent/memory/short-term-memory.server";
import { withAgentSkillList } from "@/agent/skills/registry/agent-skills";
import {
  agentBusinessesSection,
  withConversationBusiness,
} from "@/agent/tools/books/agent-conversation-business";
import type { AgentConversationBusinessState } from "@/agent/tools/books/agent-conversation-business";
import type {
  AgentChatMessage,
  AgentChatTurnOrigin,
} from "@/lib/agent-chat/conversation/agent-chat-messages";
import { appRuntime } from "@/server/runtime/app-runtime.server";

import { agentEvalHarness } from "../../harnessing/agent-harness-tree";
import {
  agentEvalAnswerText,
  agentEvalOutput,
  agentEvalToolCalls,
  agentEvalToolErrors,
  generateAgentEvalAnswer,
  recordAgentEvalAnswer,
} from "./agent-eval-answer";
import type { createAgentEvalDatabase } from "./agent-eval-database";
import type { AgentEvalWrite } from "./agent-eval-fixtures";
import { evalMessageTime } from "./agent-eval-fixtures";
import { agentEvalJudgeModel } from "./agent-eval-judge";
import { agentEvalTurns } from "./agent-eval-run-checks";
import type { AgentEvalScenario } from "./agent-eval-scenario";
import { createAgentEvalSession } from "./agent-eval-scenario";
import {
  agentEvalHistoryBusiness,
  agentEvalStepMessages,
  openAgentEvalQuestion,
  readAgentEvalUserContext,
} from "./agent-eval-step-messages";
import type { AgentEvalOpenQuestion } from "./agent-eval-step-messages";

// Runs the real agent (gpt-6-luna, its real tools and instructions) against
// an in-memory stand-in of the user's database, for the agent evals. The
// database client is a real supabase-js client whose fetch answers from the
// case's fixtures and records every write, so the evals can check what the
// agent changed without touching Supabase. Tools that reach an outside
// service get fixed answers from the case (agent-eval-scenario.ts).

// What each eval run tested, so runs compare by model and by
// instructions and tools version (DeepEval's hyperparameters; a no-op
// outside a test run). Tool descriptions steer the agent as much as the
// instructions do. Every eval file imports this module, so every run logs
// them.
const agentEvalVersion = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 12);

// The clock a case's turn runs at: the user's message time, as in the chat,
// where the user writes now. Code that reads the time (a post's age in the
// matching, a scan's "ago") then agrees with the conversation; on the real
// clock, the fixtures, dated 2026-10-04, aged a day with every day that
// passed (a renter's post scored at the 70 threshold by 2026-10-20). Only
// Date is faked, and it keeps moving, so timeouts and durations still work.
const pinEvalClock = (at: string) => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(at));
};

const logAgentEvalHyperparameters = () => {
  // A candidate harness (agent harnessing) is what the agent runs.
  const harness = agentEvalHarness();

  logHyperparameters({
    model: agentModelId,
    judge: agentEvalJudgeModel,
    instructions: agentEvalVersion(
      harness?.instructions ?? agentInstructions()
    ),
    tools: agentEvalVersion(
      Object.entries(appAgentTools)
        // Every tool's description is text; none is built per call.
        .map(
          ([name, tool]) =>
            `${name}\n${harness?.toolDescriptions?.[name] ?? (Predicate.isString(tool.description) ? tool.description : "")}`
        )
        .join("\n\n")
    ),
  });
};

logAgentEvalHyperparameters();

// Each eval file runs in its own module scope: closing its app runtime runs
// the layers' finalizers, among them the OTLP exporter's final flush (a run
// with OTEL_SDK_DISABLED=false), as the server does on close.
afterAll(async () => {
  await appRuntime.dispose();
});

/**
 * One eval run: the user's input, the agent's answer, its tool calls and
 * approvals, its writes, and the conversation's turns.
 */
export interface AgentEvalRun {
  input: string;
  output: string;
  // The agent's own words: output without the follow-up buttons, which a
  // separate call writes in the user's voice.
  answer: string;
  toolCalls: ToolCall[];
  // Tools that stopped for the user's approval instead of running.
  approvals: string[];
  // Those approval cards, for a simulated user to decide
  // (agent-eval-simulated-user.ts).
  approvalRequests: AgentEvalApprovalRequest[];
  // KeepInTax (Phase 3.1): the question the answer stopped on, waiting for
  // the page's answer; null when it asked none.
  question: AgentEvalOpenQuestion | null;
  // The follow-up questions written under the answer once it ended
  // (agent-follow-up-questions.ts); none when it asks the user or waits.
  followUps: string[];
  writes: AgentEvalWrite[];
  // The whole conversation, for agentConversationJudge: each user turn and
  // the agent's answer to it, with the tools that answer called.
  turns: Turn[];
  // The last answer's model tokens (its own calls, not search workers',
  // which agent_usage writes record) and how long it took, for benchmarks.
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

/**
 * An approval card the answer stopped at: the tool and what it would do.
 */
export interface AgentEvalApprovalRequest {
  approvalId: string;
  toolName: string;
  input: unknown;
}

/**
 * The user's next step in a conversation: a message, or their decisions on
 * the approval cards the last answer stopped at (the answer then continues
 * with no new message, as in the chat). KeepInTax (Phase 3.1): a pressed
 * button of the open question (answer, by its value; the answer continues,
 * A18), or a pressed follow-up (followUp: the message is one of the last
 * answer's follow-ups, plan §2.7 item 4).
 */
export type AgentEvalUserStep =
  | { message: string; followUp?: boolean }
  | {
      decisions: { approvalId: string; approved: boolean; reason?: string }[];
    }
  | { answer: { value: string } };

const runEvalMessages = async (
  scenario: AgentEvalScenario,
  messages: ModelMessage[],
  input: string,
  writes: AgentEvalWrite[],
  supabase: ReturnType<typeof createAgentEvalDatabase>,
  origin: AgentChatTurnOrigin = "typed",
  businesses: AgentConversationBusinessState["directory"] = []
): Promise<
  Omit<AgentEvalRun, "turns"> & { responseMessages: ModelMessage[] }
> => {
  const { result, latencyMs } = await generateAgentEvalAnswer(
    scenario,
    messages,
    input,
    supabase,
    writes,
    origin,
    businesses
  );

  const toolErrors = agentEvalToolErrors(result);
  const toolCalls = agentEvalToolCalls(result, toolErrors);
  const answer = agentEvalAnswerText(result);
  const output = agentEvalOutput(answer, result.followUps);

  // Recorded first, so the trace of a run that ends as a harness error still
  // shows what the agent did.
  recordAgentEvalAnswer({
    input,
    output,
    toolCalls,
    result,
    toolErrors,
    latencyMs,
  });

  // A case that reaches an answer its scenario does not give (AGENT_EVAL_…)
  // would be graded as if the agent had failed. It fails as a harness error
  // instead, naming the tool.
  const harnessError = toolErrors.find((error) =>
    error.message.includes("AGENT_EVAL_")
  );

  if (harnessError) {
    throw new Error(
      `AGENT_EVAL_HARNESS_ERROR: a tool reached an answer the case does not give: ${harnessError.message}`
    );
  }

  return {
    input,
    output,
    answer,
    toolCalls,
    approvals: result.content.flatMap((part) =>
      part.type === "tool-approval-request" ? [part.toolCall.toolName] : []
    ),
    approvalRequests: result.content.flatMap((part) =>
      part.type === "tool-approval-request"
        ? [
            {
              approvalId: part.approvalId,
              toolName: part.toolCall.toolName,
              input: part.toolCall.input,
            },
          ]
        : []
    ),
    question: openAgentEvalQuestion([...messages, ...result.responseMessages]),
    followUps: result.followUps,
    writes,
    usage: {
      inputTokens: result.totalUsage.inputTokens,
      outputTokens: result.totalUsage.outputTokens,
    },
    latencyMs,
    responseMessages: result.responseMessages,
  };
};

/**
 * An eval conversation in progress: its database, the model messages, writes,
 * tool calls and turns so far.
 */
export interface AgentEvalConversation {
  supabase: ReturnType<typeof createAgentEvalDatabase>;
  // The stored conversation so far, as the chat endpoint keeps it: the
  // user's messages with their user context (withAgentUserContext).
  stored: AgentChatMessage[];
  // The follow-ups under the last answer, which a follow-up press must be
  // one of (KeepInTax, Phase 3.1).
  lastFollowUps: string[];
  messages: ModelMessage[];
  writes: AgentEvalWrite[];
  toolCalls: ToolCall[];
  turns: Turn[];
  // The conversation's business after the last answer (KeepInTax,
  // 2026-11-15, business selection), or null.
  business: string | null;
}

/**
 * The data owner's businesses, read for each step as the chat endpoint
 * reads them (readAgentBusinessDirectory): none when the case gives no
 * books or the read fails.
 *
 * @param scenario - The case's fixtures.
 * @returns The directory.
 */
export const readEvalBusinessDirectory = async (scenario: AgentEvalScenario) =>
  scenario.books === undefined
    ? []
    : await Effect.runPromise(
        scenario.books.listBusinesses().pipe(
          Effect.map((directory) => directory.businesses),
          Effect.orElseSucceed(() => [])
        )
      );

/**
 * A new conversation on the case's fixtures, before the user's first step.
 *
 * @param scenario - The case's fixtures and settings.
 * @returns The empty conversation.
 */
export const startAgentEvalConversation = (
  scenario: AgentEvalScenario
): AgentEvalConversation => {
  const writes: AgentEvalWrite[] = [];

  return {
    stored: [],
    lastFollowUps: [],
    messages: [],
    writes,
    toolCalls: [],
    turns: [],
    business: scenario.conversationBusiness ?? null,
    supabase: createAgentEvalSession(scenario, writes),
  };
};

/**
 * The agent's answer to the user's next step; the run describes that
 * answer, and its tool calls and turns cover the conversation so far.
 *
 * @param scenario - The case's fixtures and settings.
 * @param step - The user's next message, with its files.
 * @param earlier - The conversation so far.
 * @returns A promise of the run and the conversation after it.
 */
export const runAgentEvalStep = async (
  scenario: AgentEvalScenario,
  step: AgentEvalUserStep,
  earlier: AgentEvalConversation
): Promise<{ run: AgentEvalRun; conversation: AgentEvalConversation }> => {
  pinEvalClock(evalMessageTime);

  const directory = await readEvalBusinessDirectory(scenario);

  const stepMessages = await agentEvalStepMessages(
    step,
    earlier.turns.length,
    earlier,
    earlier.lastFollowUps,
    { directory, current: earlier.business }
  );

  // The books as the chat endpoint gives them to the tools
  // (agent-chat-answer-run.server.ts): the conversation's business filled in.
  const business: AgentConversationBusinessState = {
    directory,
    current: stepMessages.current,
    readByNumber: new Set(),
  };

  const answered =
    scenario.books === undefined
      ? scenario
      : {
          ...scenario,
          books: withConversationBusiness(scenario.books, business),
        };

  const messages: ModelMessage[] = [
    ...earlier.messages,
    ...stepMessages.messages,
  ];

  const run = await runEvalMessages(
    answered,
    messages,
    stepMessages.input,
    earlier.writes,
    earlier.supabase,
    stepMessages.origin,
    directory
  );

  const toolCalls = [...earlier.toolCalls, ...run.toolCalls];
  const turns = [...earlier.turns, ...agentEvalTurns(stepMessages.input, run)];

  return {
    run: { ...run, toolCalls, turns },
    conversation: {
      stored: stepMessages.stored,
      lastFollowUps: run.followUps,
      messages: [...messages, ...run.responseMessages],
      writes: earlier.writes,
      supabase: earlier.supabase,
      toolCalls,
      turns,
      business: business.current,
    },
  };
};

/**
 * A conversation of user turns, one after another; the run describes the
 * last answer, and its writes and tool calls cover the whole conversation.
 *
 * @param scenario - The case's fixtures and settings.
 * @param turns - The user's messages, in order.
 * @returns A promise of the last answer's run.
 */
export const runAgentConversation = async (
  scenario: AgentEvalScenario,
  turns: string[]
) => {
  const [first, ...rest] = turns;

  if (first === undefined) {
    throw new Error("AGENT_EVAL_NO_TURNS: a conversation needs a user turn");
  }

  // One turn after another: each answers the conversation so far.
  const answerTurns = async (
    step: Awaited<ReturnType<typeof runAgentEvalStep>>,
    [next, ...later]: string[]
  ): Promise<AgentEvalRun> =>
    next === undefined
      ? step.run
      : await answerTurns(
          await runAgentEvalStep(
            scenario,
            { message: next },
            step.conversation
          ),
          later
        );

  return await answerTurns(
    await runAgentEvalStep(
      scenario,
      { message: first },
      startAgentEvalConversation(scenario)
    ),
    rest
  );
};

/**
 * A stored conversation as the chat endpoint replays it (see
 * agentChatModelHistory), a long one with its older part listed
 * (agentShortTermHistory), for cases about the history itself.
 *
 * @param scenario - The case's fixtures and settings.
 * @param history - The stored conversation.
 * @returns A promise of the run.
 */
export const runAgentHistory = async (
  scenario: AgentEvalScenario,
  history: AgentChatMessage[]
): Promise<AgentEvalRun> => {
  const writes: AgentEvalWrite[] = [];
  const supabase = createAgentEvalSession(scenario, writes);

  // KeepInTax (2026-11-15, business selection): as the chat endpoint
  // prepares a stored conversation (agentEvalHistoryBusiness).
  const directory = await readEvalBusinessDirectory(scenario);
  const prepared = agentEvalHistoryBusiness(history, directory);

  const messages = await convertToModelMessages(
    withAgentSkillList(
      agentChatModelHistory(
        agentShortTermHistory(
          withAgentUserContext(
            prepared.history,
            await readAgentEvalUserContext(
              supabase,
              agentBusinessesSection(directory, prepared.business.current)
            )
          )
        )
      )
    ),
    { tools: appAgentTools }
  );

  const answered =
    scenario.books === undefined
      ? scenario
      : {
          ...scenario,
          books: withConversationBusiness(scenario.books, prepared.business),
        };

  const lastUser = history.findLast((message) => message.role === "user");
  const input = lastUser?.parts.find((part) => part.type === "text");

  pinEvalClock(lastUser?.metadata?.createdAt ?? evalMessageTime);

  const run = await runEvalMessages(
    answered,
    messages,
    input?.type === "text" ? input.text : "",
    writes,
    supabase,
    "typed",
    directory
  );

  // The stored messages' text, then the new answer; the last user message is
  // the run's input.
  const earlier = lastUser ? history.slice(0, history.indexOf(lastUser)) : [];

  return {
    ...run,
    turns: [
      ...earlier.flatMap((message) => {
        const text = message.parts
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("\n\n");

        return text && message.role !== "system"
          ? [new Turn({ role: message.role, content: text })]
          : [];
      }),
      ...agentEvalTurns(run.input, run),
    ],
  };
};
