import type { AppAgentToolName } from "../tool-runtime/app-agent-tools";

// KeepInTax change (Phase 3.1, plan §2.6 "honest capability boundary"; GUIDE.md
// "What KeepInTax changed"): one list of what the chat can actually do. The
// role paragraph (agent-instructions.ts), the follow-up writer
// (agent-follow-up-questions.ts) and readAppKnowledge (app-knowledge.ts) are
// written from it, and the tools offered to the model are the registered ones
// minus agentToolsNotOffered, so none of them advertises a capability the
// others lack.

/**
 * What the chat can do today, one line each, in the user's terms.
 */
export const agentSupportedCapabilities = [
  "enqueue automatic classification when explicitly asked to classify all transactions, subject to existing owner consent in Settings / My Agent; never enable consent from chat; queued is not completed; uncertainties appear as in-app agent notifications",
  "classify or reclassify outgoing bank/card transactions not yet transferred to an expense using existing category defaults after approval: permanent merchant/account rule by default, or one-time when requested or selected on the card; never approve an expense",
  "answer questions about the user's expenses: totals by category, supplier or month, and which expenses, for one, several or all of their businesses",
  "read their bank and card transactions (money in and out), the invoices and receipts their business issued, their expense categories and their customers",
  "read their reports: profit and loss, the VAT report, income-tax advances, the reports coming up and their due dates, and what still needs review before a report",
  "explain how KeepInTax works",
  "remember, correct or forget a preference or a fact the user states, and save their rule for one of these actions",
  "read files the user attaches to a message",
] as const;

/**
 * What users ask for that the chat cannot do yet, with what to offer
 * instead. A request for one is answered honestly: say it is not available
 * yet, offer the nearest supported thing, and create nothing that imitates it
 * (no task, memory or setting standing in for it).
 */
export const agentUnsupportedCapabilities = [
  "monitoring the books or alerting the user when something changes (for example when fuel expenses rise): offer the current figure or a breakdown instead",
  "general reminders and monitoring notifications: offer upcoming reports and due dates; automatic-classification progress and clarification notifications ARE available in Settings / My Agent",
  "approving or booking expenses, changing confirmed transactions, issuing documents or linking documents: say where in the app it is done; classification or reclassification of an outgoing transaction not yet transferred to an expense IS supported with its approval card (permanent by default, one-time when selected)",
  "searching the web or sending email",
  "connecting a bank account or an email inbox",
] as const;

/**
 * The template's tools that stay registered, so conversations stored before
 * Phase 3.1 still validate and render (agent-chat-message-storage.server.ts
 * validates every stored part against appAgentTools), but are never offered
 * to the model and are refused if it calls one anyway (agentToolApproval):
 * - searchWeb and sendEmail, the template's examples (A16, plan §3.10);
 * - the web-only tracking, suggestion and opportunity tools, whose
 *   infrastructure waits for monitors over the books (A17, Phase 5.1);
 * - loadAgentSkill, while no playbook is offered (the template's
 *   new-user-setup and research-brief were removed from chat, §2.10).
 */
export const agentToolsNotOffered: ReadonlySet<string> =
  new Set<AppAgentToolName>([
    "searchWeb",
    "sendEmail",
    "listTrackingTasks",
    "createTrackingTask",
    "updateTrackingTask",
    "deleteTrackingTasks",
    "scanTrackingTaskNow",
    "listRecentScans",
    "suggestTrackingTasks",
    "listTaskOpportunities",
    "changeTaskOpportunityStatus",
    "loadAgentSkill",
  ]);

/**
 * Whether the model is offered this tool.
 *
 * @param toolName - The tool's name.
 * @returns Whether it is offered.
 */
export const isAgentToolOffered = (toolName: string) =>
  !agentToolsNotOffered.has(toolName);

/**
 * The capability lists as lines, for a prompt.
 *
 * @param lines - The capabilities.
 * @returns One "- " line each.
 */
export const agentCapabilityLines = (lines: readonly string[]) =>
  lines.map((line) => `- ${line}`).join("\n");
