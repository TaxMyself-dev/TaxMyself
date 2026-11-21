import type { QueryData } from "@supabase/supabase-js";
import { DateTime, Effect } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import { taskOpportunitySchema } from "@/lib/opportunities/task-opportunity-schema";
import type {
  TaskOpportunity,
  TaskOpportunityStatus,
} from "@/lib/opportunities/task-opportunity-schema";
import { recordSignedInProductEvent } from "@/server/integrations/posthog-product-events.server";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import {
  decodeSupabaseValue,
  runSupabaseQuery,
} from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

import { isNonEmptyText } from "../../../backend/shared/text/non-empty-text";

// The user's task opportunities (task_opportunities), through the user's own
// client (RLS keeps every operation to their rows). The opportunities page's
// server functions and the agent's opportunity tools both use these.

const taskOpportunityPageSize = 30;

interface TaskOpportunityFilters {
  taskId: string | null;
  statuses: readonly TaskOpportunityStatus[];
  minScore: number;
  page: number;
}

// Opportunities with their task's sentence and the item their source
// returned (task_items; the foreign key keeps it as long as the match).
const selectTaskOpportunities = (supabase: UserSupabaseClient) =>
  supabase
    .from("task_opportunities")
    .select(
      "id, task_id, source, item_id, comment_id, score, intent, reason, status, posted_at, found_at, tracking_tasks(sentence), task_items(snapshot)"
    );

type TaskOpportunityRow = QueryData<
  ReturnType<typeof selectTaskOpportunities>
>[number];

const decodeTaskOpportunity = decodeSupabaseValue(
  "TASK_OPPORTUNITIES_READ_FAILED",
  taskOpportunitySchema
);

const readTaskOpportunityRow = (row: TaskOpportunityRow) =>
  decodeTaskOpportunity({
    id: row.id,
    taskId: row.task_id,
    taskSentence: row.tracking_tasks?.sentence ?? "",
    source: row.source,
    itemId: row.item_id,
    commentId: row.comment_id || null,
    score: row.score,
    intent: row.intent,
    reason: row.reason,
    status: row.status,
    postedAt: row.posted_at,
    foundAt: row.found_at,
    item: row.task_items?.snapshot,
  });

/**
 * The user's opportunities, newest first, each with its task and its item,
 * filtered by task, status and least score.
 */
export const readStoredTaskOpportunities = Effect.fn(
  "readStoredTaskOpportunities"
)(function* readStoredTaskOpportunities(
  supabase: UserSupabaseClient,
  filters: TaskOpportunityFilters
): Effect.fn.Return<
  { opportunities: TaskOpportunity[]; hasMore: boolean },
  SupabaseQueryError
> {
  let query = selectTaskOpportunities(supabase)
    .gte("score", filters.minScore)
    .order("found_at", { ascending: false })
    .order("id");

  if (isNonEmptyText(filters.taskId)) {
    query = query.eq("task_id", filters.taskId);
  }

  if (filters.statuses.length > 0) {
    query = query.in("status", filters.statuses);
  }

  const from = filters.page * taskOpportunityPageSize;

  const { data: rows } = yield* runSupabaseQuery(
    "TASK_OPPORTUNITIES_READ_FAILED",
    () => query.range(from, from + taskOpportunityPageSize)
  );

  return {
    opportunities: yield* effectForEach(
      rows.slice(0, taskOpportunityPageSize),
      (row) => readTaskOpportunityRow(row)
    ),
    hasMore: rows.length > taskOpportunityPageSize,
  };
});

/**
 * Some of the user's opportunities by id, as the agent chat shows them;
 * ids that are not the user's are left out.
 */
export const readStoredTaskOpportunitiesById = Effect.fn(
  "readStoredTaskOpportunitiesById"
)(function* readStoredTaskOpportunitiesById(
  supabase: UserSupabaseClient,
  opportunityIds: readonly string[]
): Effect.fn.Return<TaskOpportunity[], SupabaseQueryError> {
  const { data: rows } = yield* runSupabaseQuery(
    "TASK_OPPORTUNITIES_READ_FAILED",
    () =>
      selectTaskOpportunities(supabase)
        .in("id", opportunityIds)
        .order("score", { ascending: false })
  );

  return yield* effectForEach(rows, (row) => readTaskOpportunityRow(row));
});

/**
 * Moves opportunities to a status and counts how many changed.
 *
 * @param supabase - The user's Supabase client.
 * @param opportunityIds - The opportunities.
 * @param status - The new status.
 */
export const changeStoredTaskOpportunityStatus = Effect.fn(
  "changeStoredTaskOpportunityStatus"
)(function* changeStoredTaskOpportunityStatus(
  supabase: UserSupabaseClient,
  opportunityIds: readonly string[],
  status: TaskOpportunityStatus
) {
  const updatedAt = DateTime.formatIso(yield* DateTime.now);

  const { data } = yield* runSupabaseQuery(
    "TASK_OPPORTUNITY_WRITE_FAILED",
    () =>
      supabase
        .from("task_opportunities")
        .update({ status, updated_at: updatedAt })
        .in("id", opportunityIds)
        .select("id")
  );

  yield* recordSignedInProductEvent(supabase, "opportunity_status_changed", {
    opportunities: data.length,
    status,
  });

  return data.length;
});
