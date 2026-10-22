import { Effect, Schema } from "effect";

import { userIdServerInput } from "@/lib/auth/user-id-server-input";
import { runAppRequest } from "@/server/runtime/app-runtime.server";
import { createServerFn } from "@/server/runtime/server-function";
import {
  createOwnedSupabaseClient,
  writeUserPageStateRow,
} from "@/server/user-data/user-page-state.server";

import { toStandardSchema } from "../../../backend/shared/schema/standard-schema";

// A page whose view state (form, filters, sorting, paging) is kept per user in
// Supabase's user_page_states. Result lists are kept as IDs and joined back to
// the catalogs by each page's read.
// EXAMPLE pages: the pages of yours that keep their view state.
const userPageNames = ["tasks", "search"] as const;

/**
 * A page whose state is kept per user, one of userPageNames.
 */
export type UserPageName = (typeof userPageNames)[number];

// The state travels as JSON text and must parse to an object; the table caps
// it at 64 KB. It replaces the page's previous state: view state is
// last-write-wins across tabs.
const userPageStateInputSchema = Schema.Struct({
  ...userIdServerInput.fields,
  page: Schema.Literals(userPageNames),
  state: Schema.String.check(Schema.isMaxLength(65_536)).pipe(
    Schema.decodeTo(
      Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
    )
  ),
});

/**
 * Saves a page's state for the user, on the server.
 *
 * @param context - data: the signed-in user's id, the page and its state.
 * @returns A promise that settles once it is saved.
 */
export const writeUserPageState = createServerFn({ method: "POST" })
  .validator(toStandardSchema(userPageStateInputSchema))
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* writeUserPageStateHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* writeUserPageStateRow(supabase, data.page, data.state);
      })
    );
  });
