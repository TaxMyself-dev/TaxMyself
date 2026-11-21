import type { OpenAIResponsesSystemMessageOptions } from "@ai-sdk/openai";
import type { ModelMessage } from "ai";
import { Option, Schema } from "effect";

import type { AgentSkillName } from "@/agent/skills/registry/agent-skills";

// The agent's adaptive reasoning: each turn starts at low effort (fast and
// cheap for questions one tool answers) and rises within the turn when the
// work shows it is harder, the way OpenAI recommends changing effort
// mid-conversation: the request-level effort never changes, so the prompt
// cache keeps matching, and a message-level reasoningEffortUpdate (an empty
// system message, sent to OpenAI as a configuration_update item) raises it
// for the steps after it. Updates live only in this request's model input,
// never in the stored chat, so each turn starts low again. Effort only
// rises within a turn, never falls.
//
// xhigh makes each of a turn's steps take far longer and cost several times
// more, so it is kept for two cases: the user asks for depth (Jev's depth
// signal, agent-turn-signals.ts), or a writing playbook has gathered a lot
// of evidence and is about to write it up. none is never used: a short
// message can still need a careful tool call ("כן" creating a task).

export const agentBaseReasoningEffort = "low";
const agentReasoningEfforts = ["low", "medium", "high", "xhigh"] as const;

type AgentReasoningEffort = (typeof agentReasoningEfforts)[number];

// Playbooks that end in analysis and writing for the user (a brief, a
// report) reason at high effort; the others at medium.
const agentHighEffortSkills: ReadonlySet<string> = new Set([
  "research-brief",
] satisfies AgentSkillName[]);

// A request longer than this is a detailed brief, not a quick question.
const agentDetailedRequestLength = 600;

// From this many steps in one turn, the work is a multi-step job.
const agentMultiStepCount = 3;

// From this many steps, a writing playbook has gathered its evidence
// (searches, reads) and the write-up gets xhigh.
const agentEvidenceStepCount = 6;

// Several requests in one message ("create a task and then search"): a
// multi-step job from the start. Whole words only: "ואזור" is not "ואז".
const agentSeveralRequests =
  /(?<!\p{L})(?:ואז|וגם|ואחר כך|אחרי זה|ובנוסף|and then|and also|after that)(?!\p{L})/iu;

// What one finished step of the turn shows about the work.
interface AgentReasoningStep {
  toolCalls: readonly { toolName: string; input: unknown }[];
  content: readonly { type: string }[];
}

// loadAgentSkill's input, as the step recorded it.
const agentLoadedSkillInput = Schema.decodeUnknownOption(
  Schema.Struct({ name: Schema.String })
);

const agentEffortRank = (effort: AgentReasoningEffort) =>
  agentReasoningEfforts.indexOf(effort);

const agentEffortUpdateOf = (message: ModelMessage) => {
  const update =
    message.role === "system"
      ? message.providerOptions?.openai?.reasoningEffortUpdate
      : undefined;

  return agentReasoningEfforts.find((effort) => effort === update) ?? null;
};

// The user's newest message: what they wrote, and whether it carries an
// attachment (a file part, or an <attached_file> block from
// agentChatModelHistory). thorough: the user asked for depth (Jev's depth
// signal).
const agentRequestEffort = (
  message: ModelMessage | undefined,
  thorough: boolean
): AgentReasoningEffort => {
  if (message?.role !== "user") {
    return "low";
  }

  if (thorough) {
    return "xhigh";
  }

  const parts = Array.isArray(message.content)
    ? message.content
    : [{ type: "text" as const, text: message.content }];

  let written = "";
  let attached = false;

  for (const part of parts) {
    if (part.type === "file" || part.type === "image") {
      attached = true;
    } else if (part.type === "text") {
      if (part.text.includes("<attached_file")) {
        attached = true;
      } else {
        written += part.text;
      }
    }
  }

  return attached ||
    written.length > agentDetailedRequestLength ||
    agentSeveralRequests.test(written)
    ? "medium"
    : "low";
};

/**
 * The effort this turn's work calls for so far.
 *
 * @param request - The user's newest message.
 * @param steps - The turn's steps so far.
 * @param thorough - Whether the user asked for a thorough search.
 * @returns The effort.
 */
export const agentTurnReasoningEffort = (
  request: ModelMessage | undefined,
  steps: readonly AgentReasoningStep[],
  thorough = false
): AgentReasoningEffort => {
  let effort: AgentReasoningEffort = agentRequestEffort(request, thorough);

  const raise = (to: AgentReasoningEffort) => {
    if (agentEffortRank(to) > agentEffortRank(effort)) {
      effort = to;
    }
  };

  if (steps.length >= agentMultiStepCount) {
    raise("medium");
  }

  for (const step of steps) {
    if (step.content.some((part) => part.type === "tool-error")) {
      raise("medium");
    }

    for (const call of step.toolCalls) {
      if (call.toolName !== "loadAgentSkill") {
        continue;
      }

      const skill = agentLoadedSkillInput(call.input);

      if (
        Option.isNone(skill) ||
        !agentHighEffortSkills.has(skill.value.name)
      ) {
        raise("medium");
      } else {
        raise(steps.length >= agentEvidenceStepCount ? "xhigh" : "high");
      }
    }
  }

  return effort;
};

// The system message that raises the model's reasoning effort mid-turn.
const agentReasoningEffortUpdate = (
  wanted: AgentReasoningEffort
): ModelMessage => ({
  role: "system",
  // OpenAI rejects an effort update with any content.
  content: "",
  providerOptions: {
    openai: {
      reasoningEffortUpdate: wanted,
    } satisfies OpenAIResponsesSystemMessageOptions,
  },
});

/**
 * For the agent's prepareStep: the step's messages with an effort update
 * appended when the turn's work calls for more than the current effort, or
 * undefined to leave them as they are. The update carries forward to the
 * turn's later steps (the AI SDK keeps a step's messages for the next).
 *
 * @param step - The step's messages and the turn's steps so far.
 * @param thorough - Whether the user asked for a thorough search.
 * @returns The step's messages and its effort.
 */
export const prepareAgentReasoningStep = (
  {
    messages,
    steps,
  }: {
    messages: ModelMessage[];
    steps: readonly AgentReasoningStep[];
  },
  thorough = false
) => {
  const requestIndex = messages.findLastIndex(
    (message) => message.role === "user"
  );

  let current: AgentReasoningEffort = agentBaseReasoningEffort;

  for (const message of messages.slice(requestIndex + 1)) {
    current = agentEffortUpdateOf(message) ?? current;
  }

  const wanted = agentTurnReasoningEffort(
    messages[requestIndex],
    steps,
    thorough
  );

  return agentEffortRank(wanted) <= agentEffortRank(current)
    ? undefined
    : { messages: [...messages, agentReasoningEffortUpdate(wanted)] };
};
