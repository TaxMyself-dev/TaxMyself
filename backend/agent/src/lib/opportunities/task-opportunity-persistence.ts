import { Effect, Schema } from "effect";

import { userIdServerInput } from "@/lib/auth/user-id-server-input";
import { runAppRequest } from "@/server/runtime/app-runtime.server";
import { createServerFn } from "@/server/runtime/server-function";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";
import {
  changeStoredTaskOpportunityStatus,
  readStoredTaskOpportunities,
  readStoredTaskOpportunitiesById,
} from "@/server/tasks/task-opportunity-storage.server";
import { createOwnedSupabaseClient } from "@/server/user-data/user-page-state.server";

import { toStandardSchema } from "../../../backend/shared/schema/standard-schema";
import { taskOpportunityStatuses } from "./task-opportunity-schema";
import type { TaskOpportunity } from "./task-opportunity-schema";

// One to `max` opportunity ids.
const opportunityIdsInput = (max: number) =>
  Schema.Array(Schema.String.check(Schema.isUUID())).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(max)
  );

/**
 * The user's opportunities (see readStoredTaskOpportunities).
 */
export const readTaskOpportunities = createServerFn({ method: "GET" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        taskId: Schema.NullOr(Schema.String.check(Schema.isUUID())),
        statuses: Schema.Array(Schema.Literals(taskOpportunityStatuses)).check(
          Schema.isMaxLength(5)
        ),
        minScore: Schema.Int.check(
          Schema.isGreaterThanOrEqualTo(0),
          Schema.isLessThanOrEqualTo(100)
        ),
        page: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      })
    )
  )
  .handler(
    async ({
      data,
    }): Promise<{ opportunities: TaskOpportunity[]; hasMore: boolean }> =>
      await runAppRequest(
        Effect.gen(function* readTaskOpportunitiesHandler() {
          const supabase = yield* createOwnedSupabaseClient(data.userId);

          return yield* readStoredTaskOpportunities(supabase, data);
        })
      )
  );

/**
 * The opportunities the agent chat shows (see
 * readStoredTaskOpportunitiesById).
 */
export const readTaskOpportunitiesById = createServerFn({ method: "GET" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        opportunityIds: opportunityIdsInput(30),
      })
    )
  )
  .handler(
    async ({ data }): Promise<TaskOpportunity[]> =>
      await runAppRequest(
        Effect.gen(function* readTaskOpportunitiesByIdHandler() {
          const supabase = yield* createOwnedSupabaseClient(data.userId);

          return yield* readStoredTaskOpportunitiesById(
            supabase,
            data.opportunityIds
          );
        })
      )
  );

/**
 * Moves opportunities to a status, on the server.
 *
 * @param context - data: the signed-in user's id, the opportunities and the
 *   status.
 * @returns A promise that settles once it is saved.
 */
export const changeTaskOpportunityStatus = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        opportunityIds: opportunityIdsInput(200),
        status: Schema.Literals(taskOpportunityStatuses),
      })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* changeTaskOpportunityStatusHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* changeStoredTaskOpportunityStatus(
          supabase,
          data.opportunityIds,
          data.status
        );
      })
    );
  });

/**
 * How many opportunities are still new, for the sidebar.
 */
export const countNewTaskOpportunities = createServerFn({ method: "GET" })
  .validator(toStandardSchema(userIdServerInput))
  .handler(
    async ({ data }) =>
      await runAppRequest(
        Effect.gen(function* countNewTaskOpportunitiesHandler() {
          const supabase = yield* createOwnedSupabaseClient(data.userId);

          const { count } = yield* runSupabaseQuery(
            "TASK_OPPORTUNITIES_READ_FAILED",
            () =>
              supabase
                .from("task_opportunities")
                .select("id", { count: "exact", head: true })
                .eq("status", "new")
          );

          return count ?? 0;
        })
      )
  );
