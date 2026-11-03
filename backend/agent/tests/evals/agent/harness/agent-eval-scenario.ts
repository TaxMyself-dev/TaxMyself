import { Effect } from "effect";
import { expect } from "vitest";

import { createAppAgent } from "@/agent/core/agent/app-agent";
import { AgentLanguageModel } from "@/agent/core/model/agent-model";
import type { EmailSender, WebSearch } from "@/agent/core/ports/example-ports";
import type { KeepInTaxBooks } from "@/agent/core/ports/keepintax-ports";
import type {
  TaskOpportunityStore,
  TrackingTaskStore,
} from "@/agent/core/ports/tracking-task-ports";
import { readAgentTurnSignals } from "@/agent/core/turn/agent-turn-signals";
import type { AgentMemory } from "@/lib/agent-memory/agent-memory-schema";
import type { AppLocale } from "@/lib/i18n/app-intl-locale";
import type { TaskOpportunity } from "@/lib/opportunities/task-opportunity-schema";
import type { UserSettings } from "@/lib/settings/user-settings/user-settings-schema";
import type {
  TrackingTask,
  TrackingTaskScanRun,
} from "@/lib/tasks/tracking-task-schema";
import { langfuseIntegrations } from "@/server/integrations/langfuse-tracing.server";
import { appRuntime } from "@/server/runtime/app-runtime.server";
import { readStoredUserSettings } from "@/server/user-data/user-settings-storage.server";

import { agentEvalHarness } from "../../harnessing/agent-harness-tree";
import { createAgentEvalDatabase } from "./agent-eval-database";
import type { AgentEvalData, AgentEvalWrite } from "./agent-eval-fixtures";
import { evalConversationId, evalUserId } from "./agent-eval-fixtures";
import { exampleEvalSettings } from "./agent-eval-settings-fixtures";

// A case's scenario as the agent evals run it: the real agent and model, with
// the scenario's stand-ins for every port (tracking-task-ports.ts,
// example-ports.ts): the user's tasks and opportunities in memory, and fixed answers for the outside services, each failing
// the case when the scenario gives none, so no eval reaches a real service.
// The in-memory database is seeded with the scenario's settings, memories
// and data.

/**
 * What an eval case runs on: the user's tasks and opportunities, fixed answers for the outside
 * services, the user's settings and memories, and the database rows.
 */
export interface AgentEvalScenario {
  // The user's tasks when the case starts.
  tasks?: TrackingTask[];
  // The monitor's recent scans of the tasks, newest first.
  scanRuns?: AgentEvalScanRun[];
  // What the tasks found when the case starts.
  opportunities?: TaskOpportunity[];
  // Fixed answers for searchWeb; without them, a search fails the case.
  webSearch?: WebSearch;
  // Fixed answers for sendEmail; without them, sending fails the case.
  email?: EmailSender;
  // Fixed answers for KeepInTax's books (queryExpenses); without them, a
  // query fails the case.
  books?: KeepInTaxBooks;
  settings?: UserSettings;
  memories?: AgentMemory[];
  data?: AgentEvalData;
  // The app's language for the case; English when left out.
  locale?: AppLocale;
}

/**
 * One scan the monitor ran, with its task.
 */
export type AgentEvalScanRun = TrackingTaskScanRun & { taskId: string };

const unreachable = (port: string) => () =>
  Effect.die(
    new Error(
      `AGENT_EVAL_${port}_UNREACHABLE: this case gives no ${port.toLowerCase()} answers`
    )
  );

const unreachableWebSearch: WebSearch = { search: unreachable("WEB_SEARCH") };

const unreachableEmail: EmailSender = { send: unreachable("EMAIL") };

const unreachableBooks: KeepInTaxBooks = {
  queryExpenses: unreachable("BOOKS"),
};

/**
 * The user's tracking tasks in memory: the case's starting tasks, changed by
 * the agent's calls, and every change recorded in writes as the database's
 * are. Nothing scans them: a requested scan only marks the task.
 *
 * @param tasks - The tasks the case starts with.
 * @param writes - Where each change is recorded.
 * @param scanRuns - The monitor's recent scans, newest first; none by
 *   default.
 * @returns The task store.
 */
export const createEvalTaskStore = (
  tasks: readonly TrackingTask[],
  writes: AgentEvalWrite[],
  scanRuns: readonly AgentEvalScanRun[] = []
): TrackingTaskStore => {
  let current = [...tasks];

  const record = (
    action: AgentEvalWrite["action"],
    body:
      | TrackingTask
      | { taskIds: readonly string[] }
      | { taskId: string; scanRequested: true }
  ) => {
    writes.push({
      table: "tracking_tasks",
      action,
      body: JSON.stringify(body),
    });
  };

  return {
    list: () => Effect.sync(() => [...current]),
    get: (taskId) =>
      Effect.sync(() => current.find((task) => task.id === taskId) ?? null),
    insert: (task, position) =>
      Effect.sync(() => {
        current = current.toSpliced(position, 0, task);
        record("insert", task);
      }),
    update: (task) =>
      Effect.sync(() => {
        current = current.map((stored) =>
          stored.id === task.id
            ? { ...task, version: task.version + 1 }
            : stored
        );
        record("update", task);
      }),
    delete: (taskIds) =>
      Effect.sync(() => {
        const before = current.length;
        current = current.filter((task) => !taskIds.includes(task.id));
        record("delete", { taskIds });

        return before - current.length;
      }),
    requestScan: (taskId) =>
      Effect.sync(() => {
        record("update", { taskId, scanRequested: true });

        return current.some(
          (task) => task.id === taskId && task.status === "active"
        );
      }),
    scanRuns: ({ taskId, limit }) =>
      Effect.succeed(
        scanRuns
          .filter((run) => taskId === null || run.taskId === taskId)
          .slice(0, limit)
      ),
  };
};

/**
 * The opportunities the case's tasks found, in memory; a status change is
 * recorded in writes.
 *
 * @param opportunities - The opportunities the case starts with.
 * @param writes - Where each change is recorded.
 * @returns The opportunity store.
 */
export const createEvalOpportunityStore = (
  opportunities: readonly TaskOpportunity[],
  writes: AgentEvalWrite[]
): TaskOpportunityStore => {
  let current = [...opportunities];

  return {
    list: ({ taskId, statuses, minScore }) =>
      Effect.sync(() => ({
        opportunities: current.filter((opportunity) => {
          const ofTask = taskId === null || opportunity.taskId === taskId;

          const ofStatus =
            statuses.length === 0 || statuses.includes(opportunity.status);

          return ofTask && ofStatus && opportunity.score >= minScore;
        }),
        hasMore: false,
      })),
    changeStatus: (opportunityIds, status) =>
      Effect.sync(() => {
        const changed = current.filter((opportunity) =>
          opportunityIds.includes(opportunity.id)
        ).length;

        current = current.map((opportunity) =>
          opportunityIds.includes(opportunity.id)
            ? { ...opportunity, status }
            : opportunity
        );
        writes.push({
          table: "task_opportunities",
          action: "update",
          body: JSON.stringify({ opportunityIds, status }),
        });

        return changed;
      }),
  };
};

/**
 * message: the user's words this turn, read by Jev for the turn signals as
 * the chat endpoint reads them; empty when the turn continues after
 * approvals.
 *
 * @param scenario - The case's fixtures and settings.
 * @param supabase - The case's database.
 * @param message - The user's words this turn.
 * @param writes - Where the case's stores record what the agent changed.
 * @returns A promise of the agent, its model and the trace integrations.
 */
export const createEvalAgent = async (
  scenario: AgentEvalScenario,
  supabase: ReturnType<typeof createAgentEvalDatabase>,
  message: string,
  writes: AgentEvalWrite[]
) => {
  // The app's own model (OPENAI_API_KEY), as the chat endpoint gives it, and
  // the scenario's stored settings for the tools (the model reads them in
  // the user context, agentEvalStepMessages).
  const { model, settings, traceIntegrations, turnSignals } =
    await appRuntime.runPromise(
      Effect.all(
        {
          model: Effect.map(
            Effect.service(AgentLanguageModel),
            (language) => language.model
          ),
          traceIntegrations: langfuseIntegrations,
          turnSignals: readAgentTurnSignals(message),
          settings: readStoredUserSettings(supabase, evalUserId),
        },
        { concurrency: "unbounded" }
      )
    );

  const agent = createAppAgent({
    conversationId: evalConversationId,
    userId: evalUserId,
    model,
    supabase,
    tasks: createEvalTaskStore(scenario.tasks ?? [], writes, scenario.scanRuns),
    opportunities: createEvalOpportunityStore(
      scenario.opportunities ?? [],
      writes
    ),
    webSearch: scenario.webSearch ?? unreachableWebSearch,
    email: scenario.email ?? unreachableEmail,
    books: scenario.books ?? unreachableBooks,
    settings,
    locale: scenario.locale,
    traceIntegrations,
    turnSignals,
    // A candidate harness when agent harnessing rolls this case.
    harness: agentEvalHarness(),
  });

  return { agent, model, traceIntegrations };
};

/**
 * Each case's Langfuse trace (environment "eval", set by run-agent-evals.ts):
 * tagged with the run's variant, grouped by case.
 *
 * @returns The trace's name, session, user and tags.
 */
export const agentEvalTraceAttributes = () => {
  const testName = expect.getState().currentTestName ?? "unknown case";

  return {
    traceName: "agent-eval",
    sessionId: testName.slice(0, 200),
    userId: evalUserId,
    tags: ["eval", process.env.AGENT_EVAL_VARIANT ?? "unrecorded"],
  };
};

/**
 * The case's database, its user settings drawn from the scenario (a small
 * business's by default).
 *
 * @param scenario - The case's fixtures and settings.
 * @param writes - Where each write is recorded.
 * @returns The database client.
 */
export const createAgentEvalSession = (
  scenario: AgentEvalScenario,
  writes: AgentEvalWrite[]
) => {
  const { profile, preferences, automation } =
    scenario.settings ?? exampleEvalSettings;

  return createAgentEvalDatabase(
    {
      user_settings: [
        {
          user_id: evalUserId,
          profile_kind: profile.kind,
          business_name: profile.name,
          website: profile.website,
          languages: profile.languages,
          seeking: preferences.seeking,
          not_relevant: preferences.notRelevant,
          offer: preferences.offer,
          areas: preferences.areas,
          writing_style: preferences.writingStyle,
          scan_frequency: automation.scanFrequency,
          agent_action_rules: { ...automation.agentActionRules },
        },
      ],
      agent_memories: (scenario.memories ?? []).map((memory) => ({
        id: memory.id,
        content: memory.content,
        created_at: memory.createdAt,
        updated_at: memory.updatedAt,
      })),
      ...scenario.data,
    },
    writes
  );
};
