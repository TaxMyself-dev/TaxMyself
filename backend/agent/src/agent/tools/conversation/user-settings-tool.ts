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
export const updateUserSettingsTool = tool({
  description:
    "Save stable facts the user told you about themselves into their settings, which every answer, task and match reads: what they offer (offer), seek (seeking), never want (notRelevant), their areas, writing style (how drafts sound, never facts), account kind (individual or business), business name (name: the business's only; the person's own name goes to saveAgentMemory), website and languages; also the scan frequency for new tasks. Each change replaces the field's whole value: read <user_settings> and include what stays. A fact no field holds (working days and hours, prices, their own name) goes to saveAgentMemory, never into writingStyle. Returns the changed fields.",
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
