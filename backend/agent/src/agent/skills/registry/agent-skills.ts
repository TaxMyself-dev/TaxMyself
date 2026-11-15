import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";

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
//
// KeepInTax change (Phase 3.1, plan §2.10, A19; GUIDE.md "What KeepInTax
// changed"): the template's example playbooks, new-user-setup (an onboarding
// flow inside ordinary chat) and research-brief (web research), were
// removed. No playbook is offered, so the skill list is not sent and
// loadAgentSkill is not offered (agentToolsNotOffered). Their names stay
// valid input for loadAgentSkill, because conversations stored before
// Phase 3.1 hold calls that loaded them; loading one now returns no
// playbook. KeepInTax's own onboarding playbook (keepintax-onboarding,
// plan §3.2) comes with Phase 4 and runs only when the user starts it.

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

// The playbooks offered today: none (see above).
export const agentSkills: readonly AgentSkill[] = [];

// Playbooks that were offered once and are no longer: their names still
// validate in stored loadAgentSkill calls.
const agentRetiredSkillNames = ["new-user-setup", "research-brief"] as const;

/**
 * The name of one of the agent's playbooks, offered or retired.
 */
export type AgentSkillName = (typeof agentRetiredSkillNames)[number];

// A non-empty tuple, as Schema.Literals needs it.
export const agentSkillNames: [AgentSkillName, ...AgentSkillName[]] = [
  ...agentRetiredSkillNames,
];

/**
 * The skills section of the agent's instructions: how to use the playbooks, and
 * when each one applies.
 *
 * @returns The section's text.
 */
export const agentSkillInstructions = () => `<skills>
From KeepInTax, not written by the user: the playbooks you can load.
Playbooks are step-by-step procedures for flows that take several steps; each line says when one applies.
- When the user's request is that flow, call loadAgentSkill with its name in your first step, together with the reads the request plainly needs, then follow its steps in order. A request one tool answers needs no playbook, and a shared word alone is not a match.
- Never act from these lines alone, and never name a playbook to the user. A loaded playbook holds until its flow is done; when the user asks for something it does not do, follow the user.
${agentSkills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n")}
</skills>`;

/**
 * The skill list as the first message of every conversation the model
 * reads, ahead of the user's: the same text on every request, so it stays
 * in the cached start. None while no playbook is offered.
 *
 * @returns The message, or none.
 */
export const agentSkillListMessages = (): AgentChatMessage[] =>
  agentSkills.length === 0
    ? []
    : [
        {
          id: "agent-skill-list",
          role: "user",
          parts: [{ type: "text", text: agentSkillInstructions() }],
        },
      ];

/**
 * The conversation as the model reads it, with the skill list first when
 * there is one.
 *
 * @param history - The conversation (agentChatModelHistory).
 * @returns The skill list, then the conversation.
 */
export const withAgentSkillList = (history: AgentChatMessage[]) => [
  ...agentSkillListMessages(),
  ...history,
];
