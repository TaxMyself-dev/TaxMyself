import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { Effect } from "effect";

import type {
  SupabaseDatabaseClient,
  SupabaseServiceDatabase,
} from "../../shared/supabase/supabase-service-database";
import { TaskMonitorStoreError } from "./task-monitor-store-error";

/**
 * One query or RPC of the task monitor's (task-monitor-store.ts): its data,
 * or the operation's failure code with Supabase's message (a rejected
 * request fails the same way).
 */
export type TaskMonitorQuery = <Data>(
  code: string,
  query: (
    client: SupabaseDatabaseClient
  ) => PromiseLike<PostgrestSingleResponse<Data>>
) => Effect.Effect<Data, TaskMonitorStoreError>;

/**
 * Runs the monitor's Supabase queries, turning a failure into a
 * TaskMonitorStoreError with the query's code.
 *
 * @param database - The service-role database.
 * @returns The query runner.
 */
export const makeTaskMonitorQuery = (
  database: SupabaseServiceDatabase["Service"]
): TaskMonitorQuery => {
  const taskMonitorClient = database.client.pipe(
    Effect.mapError(
      () =>
        new TaskMonitorStoreError({
          code: "TASK_MONITOR_NOT_CONFIGURED",
          detail:
            "Set DB_HOST, DB_USERNAME, DB_PASSWORD and DB_DATABASE (backend/.env).",
        })
    )
  );

  return Effect.fnUntraced(function* runTaskMonitorQuery<Data>(
    code: string,
    query: (
      client: SupabaseDatabaseClient
    ) => PromiseLike<PostgrestSingleResponse<Data>>
  ): Effect.fn.Return<Data, TaskMonitorStoreError> {
    const client = yield* taskMonitorClient;

    const response = yield* Effect.tryPromise({
      try: () => query(client),
      catch: (cause) =>
        new TaskMonitorStoreError({ code, detail: String(cause) }),
    });

    if (response.error) {
      return yield* new TaskMonitorStoreError({
        code,
        detail: response.error.message,
      });
    }

    return response.data;
  });
};
