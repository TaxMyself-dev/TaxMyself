import { openai } from "@ai-sdk/openai";

import { queryExpensesTool } from "@/agent/tools/books/query-expenses-tool";
import { setAgentActionRuleTool } from "@/agent/tools/conversation/agent-action-rule-tool";
import {
  forgetAgentMemoriesTool,
  saveAgentMemoryTool,
  updateAgentMemoryTool,
} from "@/agent/tools/conversation/agent-memory-tools";
import { updatePlanTool } from "@/agent/tools/conversation/agent-plan-tool";
import { loadAgentSkillTool } from "@/agent/tools/conversation/agent-skill-tool";
import { readAppKnowledgeTool } from "@/agent/tools/conversation/app-knowledge-tool";
import { askUserQuestionTool } from "@/agent/tools/conversation/ask-user-question-tool";
import { readAttachedDocumentTool } from "@/agent/tools/conversation/attached-document-tools";
import { searchEarlierResultsTool } from "@/agent/tools/conversation/earlier-results-tool";
import { readToolResultItemsTool } from "@/agent/tools/conversation/tool-result-items-tool";
import { updateUserSettingsTool } from "@/agent/tools/conversation/user-settings-tool";
import { sendEmailTool } from "@/agent/tools/examples/example-email-tool";
import { searchWebTool } from "@/agent/tools/examples/example-web-search-tool";
import { suggestTrackingTasksTool } from "@/agent/tools/tasks/suggested-tracking-task-tool";
import {
  changeTaskOpportunityStatusTool,
  listTaskOpportunitiesTool,
} from "@/agent/tools/tasks/task-opportunity-tools";
import {
  createTrackingTaskTool,
  deleteTrackingTasksTool,
  listRecentScansTool,
  listTrackingTasksTool,
  scanTrackingTaskNowTool,
  updateTrackingTaskTool,
} from "@/agent/tools/tasks/tracking-task-tools";

// Every tool the agent has; stored chat messages are validated against them.
export const appAgentTools = {
  // Tracking tasks and what the background monitor found for them
  // (src/agent/tools/tasks).
  listTrackingTasks: listTrackingTasksTool,
  createTrackingTask: createTrackingTaskTool,
  updateTrackingTask: updateTrackingTaskTool,
  deleteTrackingTasks: deleteTrackingTasksTool,
  scanTrackingTaskNow: scanTrackingTaskNowTool,
  listRecentScans: listRecentScansTool,
  suggestTrackingTasks: suggestTrackingTasksTool,
  listTaskOpportunities: listTaskOpportunitiesTool,
  changeTaskOpportunityStatus: changeTaskOpportunityStatusTool,
  // KeepInTax's books (src/agent/tools/books), through KeepInTaxBooks.
  queryExpenses: queryExpensesTool,
  // EXAMPLE domain tools (src/agent/tools/examples): replace with yours.
  searchWeb: searchWebTool,
  sendEmail: sendEmailTool,
  updateUserSettings: updateUserSettingsTool,
  setAgentActionRule: setAgentActionRuleTool,
  readAttachedDocument: readAttachedDocumentTool,
  readToolResultItems: readToolResultItemsTool,
  searchEarlierResults: searchEarlierResultsTool,
  readAppKnowledge: readAppKnowledgeTool,
  loadAgentSkill: loadAgentSkillTool,
  saveAgentMemory: saveAgentMemoryTool,
  updateAgentMemory: updateAgentMemoryTool,
  forgetAgentMemories: forgetAgentMemoriesTool,
  updatePlan: updatePlanTool,
  askUserQuestion: askUserQuestionTool,
  // OpenAI's hosted search over the deferred tools (agent-tool-search.ts):
  // it runs on OpenAI's side, so it has no execute here.
  toolSearch: openai.tools.toolSearch(),
};

/**
 * The name of one of the agent's tools.
 */
export type AppAgentToolName = keyof typeof appAgentTools;
