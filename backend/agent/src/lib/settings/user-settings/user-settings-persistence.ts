import { Effect, Schema } from "effect";

import { userIdServerInput } from "@/lib/auth/user-id-server-input";
import { appLocales } from "@/lib/i18n/app-intl-locale";
import { runAppRequest } from "@/server/runtime/app-runtime.server";
import { createServerFn } from "@/server/runtime/server-function";
import { createOwnedSupabaseClient } from "@/server/user-data/user-page-state.server";
import {
  readStoredUserSettings,
  saveStoredUserAppLocale,
  updateStoredUserSettings,
} from "@/server/user-data/user-settings-storage.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { userSettingChangeSchema } from "./user-settings-schema";
import type { UserSettings } from "./user-settings-schema";

/**
 * The user's settings (see readStoredUserSettings).
 */
export const readUserSettings = createServerFn({ method: "GET" })
  .validator(toStandardSchema(userIdServerInput))
  .handler(
    async ({ data }): Promise<UserSettings> =>
      await runAppRequest(
        Effect.gen(function* readUserSettingsHandler() {
          const supabase = yield* createOwnedSupabaseClient(data.userId);

          return yield* readStoredUserSettings(supabase, data.userId);
        })
      )
  );

/**
 * Saves one settings field, on the server.
 *
 * @param context - data: the signed-in user's id and the field's change.
 * @returns A promise that settles once it is saved.
 */
export const updateUserSetting = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        change: userSettingChangeSchema,
      })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* updateUserSettingHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* updateStoredUserSettings(supabase, data.userId, [data.change]);
      })
    );
  });

/**
 * The language the user uses the app in (see saveStoredUserAppLocale).
 */
export const saveUserAppLocale = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        locale: Schema.Literals(appLocales),
      })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* saveUserAppLocaleHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* saveStoredUserAppLocale(supabase, data.userId, data.locale);
      })
    );
  });
