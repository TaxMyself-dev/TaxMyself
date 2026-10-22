import { DateTime, Effect, Schema } from "effect";

import type { Json } from "@/lib/supabase/supabase-json";
import type { UserPageName } from "@/lib/user-state/user-page-state";
import { signedInSupabaseClient } from "@/server/runtime/supabase-client";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";

// The signed-in user is not the one who made the request. Its message,
// `USER_STATE_OWNER_CHANGED: …`, is what the pages match on.
class UserStateOwnerChangedError extends Schema.TaggedError<
  UserStateOwnerChangedError,
  { readonly brand: unique symbol }
>()("UserStateOwnerChangedError", {
  message: Schema.String.pipe(
    Schema.withConstructorDefault(
      Effect.succeed(
        "USER_STATE_OWNER_CHANGED: sign in to the original account"
      )
    )
  ),
}) {}

/**
 * A Supabase client for the signed-in user, after checking they are still
 * userId: a delayed request must still belong to the user who initiated it;
 * RLS alone would authorize the new session after an account switch.
 */
export const createOwnedSupabaseClient = Effect.fn("createOwnedSupabaseClient")(
  function* createOwnedSupabaseClient(userId: string) {
    const supabase = yield* signedInSupabaseClient;

    const { data } = yield* Effect.promise(
      async () => await supabase.auth.getClaims()
    );

    if (data?.claims.sub !== userId) {
      return yield* new UserStateOwnerChangedError({});
    }

    return supabase;
  }
);

/**
 * The page's stored state, or null before its first save. Each page parses
 * it where it reads it (see user_page_states).
 */
export const readUserPageStateRow = Effect.fn("readUserPageStateRow")(
  function* readUserPageStateRow(
    supabase: UserSupabaseClient,
    page: UserPageName
  ) {
    const { data } = yield* runSupabaseQuery(
      "USER_PAGE_STATE_READ_FAILED",
      () =>
        supabase
          .from("user_page_states")
          .select("state")
          .eq("page", page)
          .maybeSingle()
    );

    return data?.state ?? null;
  }
);

/**
 * Replaces the page's stored state. user_id is left to the column's
 * auth.uid() default, and RLS checks it.
 */
export const writeUserPageStateRow = Effect.fn("writeUserPageStateRow")(
  function* writeUserPageStateRow(
    supabase: UserSupabaseClient,
    page: UserPageName,
    state: Json
  ) {
    const updatedAt = DateTime.formatIso(yield* DateTime.now);
    yield* runSupabaseQuery("USER_PAGE_STATE_WRITE_FAILED", () =>
      supabase.from("user_page_states").upsert(
        {
          page,
          state,
          updated_at: updatedAt,
        },
        { onConflict: "user_id,page" }
      )
    );
  }
);
