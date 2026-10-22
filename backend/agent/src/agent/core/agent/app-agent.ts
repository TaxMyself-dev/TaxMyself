import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { isStepCount, ToolLoopAgent } from "ai";
import type { ModelMessage, StopCondition, Telemetry } from "ai";

import type { AgentChatUserSteers } from "@/agent/chat/turn/agent-chat-user-steers.server";
import type { EmailSender, WebSearch } from "@/agent/core/ports/example-ports";
import type {
  TaskOpportunityStore,
  TrackingTaskStore,
} from "@/agent/core/ports/tracking-task-ports";
import { noAgentChatPageData } from "@/agent/core/tool-runtime/agent-chat-page-data-port";
import type { AgentChatPageData } from "@/agent/core/tool-runtime/agent-chat-page-data-port";
import { repairAgentPlanInput } from "@/agent/tools/conversation/agent-plan-tool";
import type { AppLocale } from "@/lib/i18n/app-intl-locale";
import type { UserSettings } from "@/lib/settings/user-settings/user-settings-schema";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";

import { agentPromptCacheOptions } from "../model/agent-cache";
import type { AgentLanguageModel } from "../model/agent-model";
import { retryAgentModelVisibly } from "../model/agent-model-retry";
import { agentOpenAiPrivacyOptions } from "../model/agent-openai-privacy";
import {
  agentBaseReasoningEffort,
  prepareAgentReasoningStep,
} from "../model/agent-reasoning";
import { agentTelemetry } from "../model/agent-telemetry";
import { agentToolApproval } from "../tool-runtime/agent-tool-approval";
import { addAgentToolErrorNextSteps } from "../tool-runtime/agent-tool-error-next-step";
import { queueExclusiveAgentTools } from "../tool-runtime/agent-tool-exclusive-runner";
import { dropAgentToolInputNulls } from "../tool-runtime/agent-tool-null-repair";
import { deferRareAgentTools } from "../tool-runtime/agent-tool-search";
import { appAgentTools } from "../tool-runtime/app-agent-tools";
import { agentNamespaceRuleNotes } from "../turn/agent-namespace-rules";
import { noAgentTurnSignals } from "../turn/agent-turn-signals";
import type { AgentTurnSignals } from "../turn/agent-turn-signals";
import { withAgentToolDescriptions } from "./agent-harness-override";
import type { AgentHarnessOverride } from "./agent-harness-override";
import { agentInstructions } from "./agent-instructions";

// What one chat request gives the agent: the conversation, the signed-in
// user's database client (RLS keeps every tool to the user's rows) and
// their settings, for the tools. The model reads the settings and memories
// in the user context (agent-user-context.ts), part of the messages.
interface AppAgentRequest {
  conversationId: string;
  userId: string;
  // The model to answer with (AgentLanguageModel).
  model: AgentLanguageModel["Service"]["model"];
  // The tools' ports to the outside world (tracking-task-ports.ts,
  // example-ports.ts): the chat endpoint passes the real ones, an eval
  // passes fixed answers. webSearch and email are EXAMPLE ports: replace
  // them with your domain's.
  tasks: TrackingTaskStore;
  opportunities: TaskOpportunityStore;
  webSearch: WebSearch;
  email: EmailSender;
  // What tools show on the chat page; none in evals.
  pageData?: AgentChatPageData;
  supabase: UserSupabaseClient;
  settings: UserSettings;
  // The app's language: the agent replies in it (agentInstructions).
  locale?: AppLocale;
  // Langfuse's integration (LangfuseTracing), when the app traces; none in
  // unit tests.
  traceIntegrations?: readonly Telemetry[];
  // What Jev read in the user's new message (readAgentTurnSignals); none
  // when the answer continues after approvals.
  turnSignals?: AgentTurnSignals;
  // What the user writes while the agent answers, read before each step
  // after the first (agent-chat-user-steers.server.ts); none in evals.
  userSteers?: Pick<AgentChatUserSteers, "take">;
  // A candidate harness tried on an eval case (agent harnessing); never
  // from the chat.
  harness?: AgentHarnessOverride;
}

// Asking the user a question with answers to pick ends the turn: their
// answer is the next message.
const agentAskedUser: StopCondition<typeof appAgentTools> = ({ steps }) =>
  steps.at(-1)?.toolCalls.some((call) => call.toolName === "askUserQuestion") ??
  false;

// The most steps one answer may take (each step is a model call and the
// tools it called).
const agentMaxSteps = 20;

const agentLastStepNote: ModelMessage = {
  role: "system",
  content:
    "This is the last step of this answer, so tools are off. Answer the user now: what you found and did, and plainly what is left undone, which they can ask you to continue.",
};

// A call repeated with the same input this many times in one answer gets a
// reminder, and a firmer one at the second count (DeepSeek's repeat-call
// reminder; Grok Build stops a loop that makes no progress).
const agentRepeatedCallCounts = new Set([3, 5]);

// The reminder when the last step repeated a call for the third or fifth
// time, or null.
const agentToolCallKey = (call: { toolName: string; input: unknown }) =>
  `${call.toolName}:${JSON.stringify(call.input)}`;

const agentRepeatedCallNote = (
  steps: Parameters<typeof prepareAgentReasoningStep>[0]["steps"]
): ModelMessage | null => {
  const counts = new Map<string, number>();

  for (const call of steps.flatMap((step) => step.toolCalls)) {
    counts.set(
      agentToolCallKey(call),
      (counts.get(agentToolCallKey(call)) ?? 0) + 1
    );
  }

  const repeated = steps
    .at(-1)
    ?.toolCalls.find((call) =>
      agentRepeatedCallCounts.has(counts.get(agentToolCallKey(call)) ?? 0)
    );

  if (!repeated) {
    return null;
  }

  const times = counts.get(agentToolCallKey(repeated)) ?? 0;

  return {
    role: "system",
    content:
      times < 5
        ? `You called ${repeated.toolName} with the same input ${times} times in this answer; its result will not change. Use what you have, try a different input or tool, or tell the user what blocks you.`
        : `You called ${repeated.toolName} with the same input ${times} times. Stop calling it: tell the user what you found, what failed, and what they can do.`,
  };
};

/**
 * The last allowed step answers with no tools, so a long job never ends on
 * tool results without a word to the user (Grok Bot's owed delivery); the
 * steps before it raise reasoning with the work, get the rules of the
 * deferred tools in use (agent-namespace-rules.ts) and are reminded when
 * they repeat a call. The first step after the user's message reads the turn
 * signals' hints (agent-turn-signals.ts); the AI SDK keeps a step's messages
 * for the next, so they stay for the turn, and a run that goes on after a
 * stop hook's note (agent-stop-hooks.ts) does not read them again.
 *
 * @param step - The step the agent is about to run.
 * @param signals - What the turn has asked for so far, such as a thorough
 *   search.
 * @param firstStepTools - The tools the first step may call (every tool but
 *   updatePlan); all of them when left out.
 * @returns The step's settings: its reasoning effort, messages and tools.
 */
export const prepareAppAgentStep = <ToolName extends string>(
  step: Parameters<typeof prepareAgentReasoningStep>[0],
  signals: AgentTurnSignals = noAgentTurnSignals,
  firstStepTools?: readonly ToolName[]
):
  | {
      messages?: ModelMessage[];
      toolChoice?: "none";
      activeTools?: ToolName[];
    }
  | undefined => {
  const reasoning = prepareAgentReasoningStep(step, signals.thorough);
  const last = step.steps.length >= agentMaxSteps - 1;

  // The first step has no updatePlan: a plan sent alone was a model step of
  // its own (about 4 s) in most planned answers, and the instructions alone
  // did not change that (2026-10-16). From the second step the plan goes
  // with real tool calls. The same list on every first step keeps its
  // prompt cache. A message of several requests (signals.several) plans
  // from the first step, with its reads.
  const tools =
    step.steps.length === 0 && firstStepTools !== undefined && !signals.several
      ? { activeTools: [...firstStepTools] }
      : null;

  const hints: ModelMessage | null =
    step.steps.length === 0 &&
    step.messages.at(-1)?.role === "user" &&
    signals.hints.length > 0
      ? { role: "system", content: signals.hints.join("\n") }
      : null;

  const notes = [
    hints,
    ...agentNamespaceRuleNotes(step.messages),
    agentRepeatedCallNote(step.steps),
    last ? agentLastStepNote : null,
  ].filter((note) => note !== null);

  if (notes.length === 0) {
    return tools === null ? reasoning : { ...reasoning, ...tools };
  }

  return {
    messages: [...(reasoning?.messages ?? step.messages), ...notes],
    ...(last && { toolChoice: "none" as const }),
    ...tools,
  };
};

/**
 * The agent behind the chat (/api/agent/chat), made for each request: the
 * tools are shared, and each one receives the request's user and settings
 * through its tool context. Its loop ends when a step writes text and calls
 * no tool, asks with askUserQuestion, waits for an approval, or reaches the
 * step limit; the chat and the evals then run the stop hooks
 * (agent-stop-hooks.ts) and write the follow-up questions
 * (agent-follow-up-questions.ts).
 *
 * @param request - The request's user, conversation, clients and settings.
 * @returns The agent for this request.
 */
export const createAppAgent = (request: AppAgentRequest) => {
  // The tools as they run (failures explained, changes and approvals
  // queued); the agent gets them with the rare ones deferred.
  const runnableTools = queueExclusiveAgentTools(
    addAgentToolErrorNextSteps(appAgentTools)
  );

  const agentProviderOptions = {
    openai: {
      reasoningEffort: agentBaseReasoningEffort,
      reasoningSummary: "auto",
      ...agentPromptCacheOptions(request.userId),
      ...agentOpenAiPrivacyOptions(request.userId),
    } satisfies OpenAILanguageModelResponsesOptions,
  };

  const toolContext = {
    conversationId: request.conversationId,
    userId: request.userId,
    supabase: request.supabase,
    tasks: request.tasks,
    opportunities: request.opportunities,
    webSearch: request.webSearch,
    email: request.email,
    pageData: request.pageData ?? noAgentChatPageData,
    settings: request.settings,
  };

  const tools = withAgentToolDescriptions(
    deferRareAgentTools(runnableTools),
    request.harness?.toolDescriptions
  );

  const firstStepTools = Object.keys(tools).filter(
    (name): name is keyof typeof tools =>
      Object.hasOwn(tools, name) && name !== "updatePlan"
  );

  return new ToolLoopAgent({
    // Retried in sight of the user; the SDK's silent retries are off.
    model: retryAgentModelVisibly(
      request.model,
      toolContext.pageData.showRetry
    ),
    maxRetries: 0,
    instructions:
      request.harness?.instructions ?? agentInstructions(request.locale),
    // Changes and approvals run one at a time (agent-tool-traits.ts),
    // every failure tells the model what to do next, and rare tools load
    // through tool search (agent-tool-search.ts).
    tools,
    // Every tool that declares contextSchema gets the request's context.
    toolsContext: {
      listTrackingTasks: toolContext,
      createTrackingTask: toolContext,
      updateTrackingTask: toolContext,
      deleteTrackingTasks: toolContext,
      scanTrackingTaskNow: toolContext,
      listRecentScans: toolContext,
      listTaskOpportunities: toolContext,
      changeTaskOpportunityStatus: toolContext,
      searchWeb: toolContext,
      sendEmail: toolContext,
      searchEarlierResults: toolContext,
      updateUserSettings: toolContext,
      setAgentActionRule: toolContext,
      readAttachedDocument: toolContext,
      saveAgentMemory: toolContext,
      updateAgentMemory: toolContext,
      forgetAgentMemories: toolContext,
    },
    // Counts and timings to Grafana (agent-telemetry.ts reads no content),
    // and the whole answer, masked, to Langfuse (langfuse-tracing.server.ts).
    telemetry: {
      functionId: "app-agent",
      integrations: [agentTelemetry, ...(request.traceIntegrations ?? [])],
    },
    // The user's rules decide (agent-action-rules.ts); without one, tools
    // that change data the user cannot get back, or act outside the app in
    // the user's name, ask first (agentToolEffects "approval").
    toolApproval: ({ toolCall }) =>
      agentToolApproval(toolCall, request.settings.automation.agentActionRules),
    stopWhen: [isStepCount(agentMaxSteps), agentAskedUser],
    // Adaptive reasoning: each turn starts at agentBaseReasoningEffort and
    // rises with the work through message-level effort updates, which need
    // system messages in the model input (agent-reasoning.ts). Chat
    // messages are user and assistant only, so no user text becomes one.
    allowSystemInMessages: true,
    // A message the user sent meanwhile joins the answer before the next
    // step, as Pi's steering messages do; the returned messages keep it for
    // the steps after.
    prepareStep: async (step) => {
      const steers =
        step.steps.length > 0 && request.userSteers
          ? await request.userSteers.take(step.responseMessages.length)
          : [];

      if (steers.length === 0) {
        return prepareAppAgentStep(step, request.turnSignals, firstStepTools);
      }

      const messages = [...step.messages, ...steers];

      const prepared = prepareAppAgentStep(
        { ...step, messages },
        request.turnSignals,
        firstStepTools
      );

      return { ...prepared, messages: prepared?.messages ?? messages };
    },
    // A plan whose status carries its reason is repaired, not refused;
    // another refused call goes again without its null fields
    // (agent-tool-null-repair.ts).
    repairToolCall: async ({ toolCall }) => {
      const input =
        toolCall.toolName === "updatePlan"
          ? repairAgentPlanInput(toolCall.input)
          : dropAgentToolInputNulls(toolCall.input);

      return await Promise.resolve(
        input === null ? null : { ...toolCall, input }
      );
    },
    providerOptions: agentProviderOptions,
  });
};
