import { tool } from "ai";
import { Effect, Schema } from "effect";

import { userProfileSettingChangeSchema } from "@/lib/settings/user-settings/user-settings-schema";
import { appRuntime } from "@/server/runtime/app-runtime.server";
import { updateStoredUserSettings } from "@/server/user-data/user-settings-storage.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";

// The changes as the model writes them: one optional key per field, made
// from userProfileSettingChangeSchema's members so the fields have one
// definition. As a list of {field, value} objects they were about 2,400
// characters of every request's tools; as keys, a third of that.
const agentSettingChangesSchema = Schema.Struct(
  Object.fromEntries(
    userProfileSettingChangeSchema.members.map((member) => [
      member.fields.field.literal,
      Schema.optionalKey(member.fields.value),
    ])
  )
);

const decodeSettingChanges = Schema.decodeUnknownEffect(
  Schema.Array(userProfileSettingChangeSchema).check(Schema.isMinLength(1))
);

// Saves what the user tells the agent about themselves into their settings,
// the same fields the settings pages edit. EXAMPLE fields: use yours.
// KeepInTax (Phase 3.1, plan §2.10): only a change the user asks for; the
// template's profile fields are no longer gaps the agent fills (Phase 3.2
// replaces them with KeepInTax's own assistant settings).
export const updateUserSettingsTool = tool({
  description:
    "Change the user's settings when they ask for that change: account kind (individual or business), business name (name: the business's only), website, languages, writing style (how drafts sound, never facts), what they offer (offer), seek (seeking), never want (notRelevant), their areas, and the scan frequency. Never to fill in details the user did not ask to change. Each change replaces the field's whole value: read <user_settings> and include what stays. A fact or preference no field holds goes to saveAgentMemory. Returns the changed fields.",
  inputSchema: toStandardSchema(
    Schema.Struct({ changes: agentSettingChangesSchema })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ changes }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      Effect.gen(function* updateUserSettings() {
        const fieldChanges = yield* decodeSettingChanges(
          Object.entries(changes).map(([field, value]) => ({ field, value }))
        );

        yield* updateStoredUserSettings(
          context.supabase,
          context.userId,
          fieldChanges
        );

        return { updated: fieldChanges.map((change) => change.field) };
      }),
      { signal: abortSignal }
    ),
});
