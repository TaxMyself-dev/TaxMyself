import { tool } from "ai";
import { Effect, Schema } from "effect";

import { taskOpportunityStatuses } from "@/lib/opportunities/task-opportunity-schema";
import type { TaskOpportunity } from "@/lib/opportunities/task-opportunity-schema";
import { appRuntime } from "@/server/runtime/app-runtime.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import { agentToolModelOutput } from "../../core/tool-runtime/agent-tool-output";
import { agentToolUuid } from "../../core/tool-runtime/agent-tool-uuid";

// The agent's tools for opportunities, through the same storage
// as the opportunities page.

// Long items are cut so a page of opportunities stays small for the model.
const agentItemExcerptLength = 600;

/**
 * An opportunity as the agent reads it: who wants what, why it fits, and
 * where to answer, with a long item cut to agentItemExcerptLength.
 *
 * @param opportunity - The stored opportunity.
 * @returns Its summary for the model.
 */
export const agentTaskOpportunitySummary = (opportunity: TaskOpportunity) => ({
  id: opportunity.id,
  task: opportunity.taskSentence,
  status: opportunity.status,
  score: opportunity.score,
  intent: opportunity.intent,
  reason: opportunity.reason,
  source: opportunity.source,
  title: opportunity.item.title,
  url: opportunity.item.url,
  text: opportunity.item.text.slice(0, agentItemExcerptLength) || null,
  // The matching reply's text, when the match is a reply.
  reply:
    opportunity.item.comments
      .find((comment) => comment.id === opportunity.commentId)
      ?.text?.slice(0, agentItemExcerptLength) ?? null,
  postedAt: opportunity.postedAt,
  foundAt: opportunity.foundAt,
});

export const listTaskOpportunitiesTool = tool({
  description:
    "List the opportunities the monitor found for the user's tasks, newest first, 30 per page (when hasMore, ask for the next): who wants what, why it fits, the score, the item and its link. Ids feed changeTaskOpportunityStatus. The chat shows them as cards.",
  // Each default is also annotated, so the model's JSON Schema shows it.
  inputSchema: toStandardSchema(
    Schema.Struct({
      taskId: Schema.NullOr(agentToolUuid)
        .annotate({
          default: null,
          description:
            "One task's id from listTrackingTasks, or null for every task",
        })
        .pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
      statuses: Schema.Array(Schema.Literals(taskOpportunityStatuses))
        .check(Schema.isMaxLength(5))
        .annotate({
          default: [],
          description: "Only these statuses; empty for every status",
        })
        .pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
      minScore: Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0),
        Schema.isLessThanOrEqualTo(100)
      )
        .annotate({
          default: 0,
          description:
            "Only opportunities scored at least this, 0-100, by how well they fit the task",
        })
        .pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
      page: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
        .annotate({
          default: 0,
          description: "The page, from 0; the next one when hasMore is true",
        })
        .pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (filters, { context, abortSignal }) =>
    await appRuntime.runPromise(
      Effect.gen(function* listTaskOpportunities() {
        const { opportunities, hasMore } =
          yield* context.opportunities.list(filters);

        // The chat's cards get the full opportunities now; the model and the
        // stored answer get the short version below.
        context.pageData.showOpportunities(opportunities);

        return {
          hasMore,
          opportunities: opportunities.map(agentTaskOpportunitySummary),
        };
      }),
      { signal: abortSignal }
    ),
  toModelOutput: ({ output, toolCallId }) =>
    agentToolModelOutput({ output, toolCallId }),
});

export const changeTaskOpportunityStatusTool = tool({
  description:
    "Move opportunities (ids from listTaskOpportunities) to one status, when the user says what happened with them or asks to file them. Returns how many changed. Moving one to irrelevant needs the user's agreement first; new undoes any earlier move.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      opportunityIds: Schema.Array(agentToolUuid).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(200)
      ),
      status: Schema.Literals(taskOpportunityStatuses).annotate({
        description:
          "new: not handled yet (also undoes a change). in_progress: the user is handling it. replied: the user answered it. closed: done. irrelevant: does not fit the task; only after the user agrees",
      }),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ opportunityIds, status }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      context.opportunities
        .changeStatus(opportunityIds, status)
        .pipe(Effect.map((changed) => ({ changed, status }))),
      { signal: abortSignal }
    ),
});
