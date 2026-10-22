import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";

import { newUserSetupSkill } from "../playbooks/new-user-setup-skill";
import { researchBriefSkill } from "../playbooks/research-brief-skill";

// The agent's skills: playbooks for flows that only some chats need, as
// Codex and Grok Build keep skills. Their list (each skill's name and when
// to use it, agentSkillInstructions) is a message of its own at the start
// of every conversation (agentSkillListMessage), not part of the
// instructions, as Claude Code, Codex, Grok Build and DeepSeek send theirs;
// the agent loads a playbook itself with loadAgentSkill when the chat calls
// for it. Flows nearly every chat uses stay in the instructions instead
// (agent-instructions.ts).
//
// Skills ship with the code, so the list never changes between requests and
// the prompt cache keeps matching (see agentPromptCacheOptions).

/**
 * A playbook the agent loads for a flow that takes several steps: its name,
 * when to use it, and its steps.
 */
export interface AgentSkill {
  // The id the agent loads it by; the chat names the skill by it, in the
  // page's language (agentSkillTitle).
  name: string;
  // When to use it, as the agent reads it in the skill list.
  description: string;
  // The playbook, read by the agent once loaded.
  content: string;
}

// EXAMPLE playbooks: replace with your product's multi-step flows.
export const agentSkills = [
  newUserSetupSkill,
  researchBriefSkill,
] as const satisfies readonly AgentSkill[];

/**
 * The name of one of the agent's playbooks.
 */
export type AgentSkillName = (typeof agentSkills)[number]["name"];

const [firstAgentSkill, ...otherAgentSkills] = agentSkills;

// A non-empty tuple, as z.enum needs it.
export const agentSkillNames: [AgentSkillName, ...AgentSkillName[]] = [
  firstAgentSkill.name,
  ...otherAgentSkills.map((skill) => skill.name),
];

/**
 * The skills section of the agent's instructions: how to use the playbooks, and
 * when each one applies.
 *
 * @returns The section's text.
 */
export const agentSkillInstructions = () => `<skills>
From YourApp, not written by the user: the playbooks you can load.
Playbooks are step-by-step procedures for flows that take several steps; each line says when one applies.
- When the user's request is that flow, call loadAgentSkill with its name in your first step, together with the reads the request plainly needs (the user's tasks), then follow its steps in order. A request one tool answers needs no playbook, and a shared word alone (task, research) is not a match.
- Never act from these lines alone, and never name a playbook to the user. A loaded playbook holds until its flow is done; when the user asks for something it does not do, follow the user.
${agentSkills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n")}
</skills>`;

/**
 * The skill list as the first message of every conversation the model
 * reads, ahead of the user's: the same text on every request, so it stays
 * in the cached start.
 *
 * @returns The message.
 */
export const agentSkillListMessage = (): AgentChatMessage => ({
  id: "agent-skill-list",
  role: "user",
  parts: [{ type: "text", text: agentSkillInstructions() }],
});

/**
 * The conversation as the model reads it, with the skill list first.
 *
 * @param history - The conversation (agentChatModelHistory).
 * @returns The skill list, then the conversation.
 */
export const withAgentSkillList = (history: AgentChatMessage[]) => [
  agentSkillListMessage(),
  ...history,
];
