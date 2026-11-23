import { DateTime, Effect, Schema } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import { userIdServerInput } from "@/lib/auth/user-id-server-input";
import { runAppRequest } from "@/server/runtime/app-runtime.server";
import { createServerFn } from "@/server/runtime/server-function";
import {
  decodeSupabaseValue,
  runSupabaseQuery,
} from "@/server/runtime/supabase-query";
import { createOwnedSupabaseClient } from "@/server/user-data/user-page-state.server";

import { toStandardSchema } from "../../../backend/shared/schema/standard-schema";

// In-app notifications (user_notifications), written by the task monitor:
// a new match for a task, or a task whose scan failed.
export const userNotificationSchema = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  kind: Schema.Literals(["opportunity", "task-error"]),
  title: Schema.String,
  body: Schema.String,
  taskId: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  opportunityId: Schema.NullOr(Schema.String.check(Schema.isUUID())),
  read: Schema.Boolean,
  createdAt: Schema.String,
});

/**
 * A notification the task monitor wrote: its kind, text, the task or
 * opportunity it is about, and whether it was read.
 */
export type UserNotification = typeof userNotificationSchema.Type;

// The 30 newest notifications and how many are unread.

const decodeUserNotification = decodeSupabaseValue(
  "USER_NOTIFICATIONS_READ_FAILED",
  userNotificationSchema
);

/**
 * The user's notifications and how many are unread, read on the server.
 *
 * @param context - data: the signed-in user's id.
 * @returns A promise of the notifications and the unread count.
 */
export const readUserNotifications = createServerFn({ method: "GET" })
  .validator(toStandardSchema(userIdServerInput))
  .handler(
    async ({
      data,
    }): Promise<{ notifications: UserNotification[]; unread: number }> =>
      await runAppRequest(
        Effect.gen(function* readUserNotificationsHandler() {
          const supabase = yield* createOwnedSupabaseClient(data.userId);

          const [list, unread] = yield* Effect.all(
            [
              runSupabaseQuery("USER_NOTIFICATIONS_READ_FAILED", () =>
                supabase
                  .from("user_notifications")
                  .select(
                    "id, kind, title, body, task_id, opportunity_id, read_at, created_at"
                  )
                  .order("created_at", { ascending: false })
                  .limit(30)
              ),
              runSupabaseQuery("USER_NOTIFICATIONS_READ_FAILED", () =>
                supabase
                  .from("user_notifications")
                  .select("id", { count: "exact", head: true })
                  .is("read_at", null)
              ),
            ],
            { concurrency: "unbounded" }
          );

          return {
            notifications: yield* effectForEach(list.data, (row) =>
              decodeUserNotification({
                id: row.id,
                kind: row.kind,
                title: row.title,
                body: row.body,
                taskId: row.task_id,
                opportunityId: row.opportunity_id,
                read: row.read_at !== null,
                createdAt: row.created_at,
              })
            ),
            unread: unread.count ?? 0,
          };
        })
      )
  );

/**
 * Marks the given notifications read, or all of them.
 */
export const markUserNotificationsRead = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        notificationIds: Schema.NullOr(
          Schema.Array(Schema.String.check(Schema.isUUID())).check(
            Schema.isMaxLength(200)
          )
        ),
      })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* markUserNotificationsReadHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        const readAt = DateTime.formatIso(yield* DateTime.now);

        let query = supabase
          .from("user_notifications")
          .update({ read_at: readAt })
          .is("read_at", null);

        if (data.notificationIds) {
          query = query.in("id", data.notificationIds);
        }

        yield* runSupabaseQuery("USER_NOTIFICATIONS_WRITE_FAILED", () => query);
      })
    );
  });
