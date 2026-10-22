import { Schema } from "effect";

// The input every per-user server function starts with: the signed-in user's
// id. createOwnedSupabaseClient refuses an id that is not the session's.
export const userIdServerInput = Schema.Struct({
  userId: Schema.String.check(Schema.isUUID()),
});
