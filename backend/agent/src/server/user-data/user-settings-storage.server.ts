import { DateTime, Effect } from "effect";
import { absurd } from "effect/Function";

import type { AppLocale } from "@/lib/i18n/app-intl-locale";
import { userSettingsSchema } from "@/lib/settings/user-settings/user-settings-schema";
import type {
  UserSettingChange,
  UserSettings,
} from "@/lib/settings/user-settings/user-settings-schema";
import type { Database } from "@/lib/supabase/supabase-database";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import {
  decodeSupabaseValue,
  runSupabaseQuery,
} from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

const decodeUserSettings = decodeSupabaseValue(
  "USER_SETTINGS_READ_FAILED",
  userSettingsSchema
);

const readUserSettingsRow = (row: UserSettingsRow) =>
  decodeUserSettings({
    profile: {
      kind: row.profile_kind,
      name: row.business_name,
      website: row.website,
      languages: row.languages,
    },
    preferences: {
      seeking: row.seeking,
      notRelevant: row.not_relevant,
      offer: row.offer,
      areas: row.areas,
      writingStyle: row.writing_style,
    },
    automation: {
      scanFrequency: row.scan_frequency,
      agentActionRules: row.agent_action_rules,
    },
  });

/**
 * The user's settings. The row exists from signup on (see
 * private.create_user_settings), so every default lives in the user_settings
 * table and reading never writes. The settings pages and the agent read them
 * here.
 */
export const readStoredUserSettings = Effect.fn("readStoredUserSettings")(
  function* readStoredUserSettings(
    supabase: UserSupabaseClient,
    userId: string
  ): Effect.fn.Return<UserSettings, SupabaseQueryError> {
    const { data: row } = yield* runSupabaseQuery(
      "USER_SETTINGS_READ_FAILED",
      () =>
        supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", userId)
          .single()
    );

    return yield* readUserSettingsRow(row);
  }
);

const userSettingColumn = (
  change: UserSettingChange
): Database["public"]["Tables"]["user_settings"]["Insert"] => {
  switch (change.field) {
    case "kind": {
      return { profile_kind: change.value };
    }

    case "name": {
      return { business_name: change.value };
    }

    case "website": {
      return { website: change.value };
    }

    case "languages": {
      return { languages: [...change.value] };
    }

    case "seeking": {
      return { seeking: change.value };
    }

    case "notRelevant": {
      return { not_relevant: change.value };
    }

    case "offer": {
      return { offer: change.value };
    }

    case "areas": {
      return { areas: change.value };
    }

    case "writingStyle": {
      return { writing_style: change.value };
    }

    case "scanFrequency": {
      return { scan_frequency: change.value };
    }

    case "agentActionRules": {
      return { agent_action_rules: { ...change.value } };
    }

    default: {
      return absurd<never>(change);
    }
  }
};

/**
 * Saves the language the user uses the app in (user_settings.app_locale), so
 * work that runs without the page (emails, background jobs) writes in it.
 */
export const saveStoredUserAppLocale = Effect.fn("saveStoredUserAppLocale")(
  function* saveStoredUserAppLocale(
    supabase: UserSupabaseClient,
    userId: string,
    locale: AppLocale
  ) {
    yield* runSupabaseQuery("USER_APP_LOCALE_WRITE_FAILED", () =>
      supabase
        .from("user_settings")
        .update({ app_locale: locale })
        .eq("user_id", userId)
        .select("user_id")
        .single()
    );
  }
);

/**
 * Saves settings changes in one statement; the settings pages save one field
 * at a time, the agent several. Each change writes only its own column, so
 * changes from two places never overwrite each other's fields.
 */
export const updateStoredUserSettings = Effect.fn("updateStoredUserSettings")(
  function* updateStoredUserSettings(
    supabase: UserSupabaseClient,
    userId: string,
    changes: readonly UserSettingChange[]
  ) {
    const columns: Database["public"]["Tables"]["user_settings"]["Update"] = {
      updated_at: DateTime.formatIso(yield* DateTime.now),
    };

    for (const change of changes) {
      Object.assign(columns, userSettingColumn(change));
    }

    // single() fails when no row changed, so a lost write is never silent.
    yield* runSupabaseQuery("USER_SETTINGS_WRITE_FAILED", () =>
      supabase
        .from("user_settings")
        .update(columns)
        .eq("user_id", userId)
        .select("user_id")
        .single()
    );
  }
);
