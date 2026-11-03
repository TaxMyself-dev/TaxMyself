import type { AppAgentToolName } from "./app-agent-tools";

// What each agent tool does to the world, the one place that decides how the
// agent may run it. The approval list, the tools that run one at a time, and
// whether "try again" may rerun an answer all come from this table, so a new
// tool states it once and none of them can drift (as Claude Code's tool
// defaults and Codex's parallel flag do; docs/research/agent-harness).
//
// - read: your database or static app data. No external effect.
// - ui: shows something in the chat. No external effect.
// - external: a read from an outside service (a search, a scraper, a partner
//   API) that may be slow, paced or paid; no change to the user's data.
// - write: changes the user's data in your database.
// - approval: an action the user cannot take back, or one that acts in their
//   name outside the app; it waits for the user's approval card.
type AgentToolEffect = "read" | "ui" | "external" | "write" | "approval";

const agentToolEffects = {
  listTrackingTasks: "read",
  createTrackingTask: "write",
  updateTrackingTask: "write",
  // Deletes the tasks with their opportunities, for good.
  deleteTrackingTasks: "approval",
  // Only marks the task due; the background worker scans it.
  scanTrackingTaskNow: "write",
  listRecentScans: "read",
  suggestTrackingTasks: "ui",
  listTaskOpportunities: "read",
  changeTaskOpportunityStatus: "write",
  // KeepInTax's books: reads what the expenses page reads.
  queryExpenses: "read",
  // EXAMPLE domain tools: give each of yours its effect here.
  searchWeb: "external",
  sendEmail: "approval",
  updateUserSettings: "write",
  // Saves the user's rule for an action; "allow" asks first
  // (agentToolApproval).
  setAgentActionRule: "write",
  // This chat's saved messages; no outside read.
  searchEarlierResults: "read",
  readAttachedDocument: "read",
  // Reads the rest of a result already returned; searches nothing.
  readToolResultItems: "read",
  readAppKnowledge: "read",
  loadAgentSkill: "read",
  saveAgentMemory: "write",
  updateAgentMemory: "write",
  forgetAgentMemories: "write",
  updatePlan: "ui",
  askUserQuestion: "ui",
  // OpenAI's search over the deferred tools; it only loads definitions.
  toolSearch: "read",
} as const satisfies Record<AppAgentToolName, AgentToolEffect>;

const agentToolEffectsByName: ReadonlyMap<string, AgentToolEffect> = new Map(
  Object.entries(agentToolEffects)
);

// An unknown name (a tool removed since the message was stored) counts as
// the riskiest kind.
const agentToolEffect = (toolName: string): AgentToolEffect =>
  agentToolEffectsByName.get(toolName) ?? "approval";

/**
 * Waits for the user's approval card, every time.
 *
 * @param toolName - The tool's name.
 * @returns Whether the tool waits for approval.
 */
export const agentToolNeedsApproval = (toolName: string) =>
  agentToolEffect(toolName) === "approval";

/**
 * Leaves nothing behind, so an answer that used only these may be answered
 * again ("try again"). External reads may spend a quota or cost, but they
 * do not change the user's data.
 *
 * @param toolName - The tool's name.
 * @returns Whether the tool leaves nothing behind.
 */
export const agentToolLeavesNoTrace = (toolName: string) =>
  !["write", "approval"].includes(agentToolEffect(toolName));

/**
 * Runs alone: changes must not race (two creations in one step would take
 * the same position), and approvals go one at a time. The AI SDK runs every
 * tool call of a step at once, so the agent queues these itself
 * (agentToolExclusiveRunner). Add your own kinds here when an outside
 * service allows one call at a time (one browser, one account's quota).
 *
 * @param toolName - The tool's name.
 * @returns Whether the tool runs alone.
 */
export const agentToolRunsAlone = (toolName: string) =>
  ["write", "approval"].includes(agentToolEffect(toolName));

/**
 * Changes data, acts in the user's name, or reads an outside service: an
 * answer after it is checked against what it returned (agent-answer-check.ts).
 *
 * @param toolName - The tool's name.
 * @returns Whether an answer after the tool is checked.
 */
export const agentToolNeedsAnswerCheck = (toolName: string) =>
  ["write", "approval", "external"].includes(agentToolEffect(toolName));

/**
 * Only shows something in the chat (a plan, a question): text
 * written after it still answers what the work before it found.
 *
 * @param toolName - The tool's name.
 * @returns Whether the tool only shows something.
 */
export const agentToolOnlyShows = (toolName: string) =>
  agentToolEffect(toolName) === "ui";
