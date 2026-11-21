import type { Json } from "./supabase-json";
import type { SupabaseTable } from "./supabase-table";

// One settings column per setting (user-settings-schema.ts). EXAMPLE
// columns: the settings the agent reads and writes; add yours.
interface UserSettingsColumnTypes {
  agent_action_rules: Json;
  app_locale: "he" | "en";
  areas: string;
  business_name: string;
  languages: string[];
  not_relevant: string;
  offer: string;
  profile_kind: string;
  scan_frequency: string;
  seeking: string;
  updated_at: string;
  user_id: string;
  website: string;
  writing_style: string;
}

// Supabase's table types need an index signature, which an interface lacks;
// mapping it into an object type gives it one (as supabase-database.ts does
// for the tables).
type UserSettingsColumns = {
  [Column in keyof UserSettingsColumnTypes]: UserSettingsColumnTypes[Column];
};

/**
 * The Supabase tables of the user's own data: page states and settings.
 */
export interface SupabaseUserTables {
  user_page_states: SupabaseTable<
    {
      page: string;
      state: Json;
      updated_at: string;
      user_id: string;
    },
    {
      page: string;
      state: Json;
      updated_at?: string;
      user_id?: string;
    },
    []
  >;
  user_settings: SupabaseTable<
    UserSettingsColumns,
    Partial<UserSettingsColumns>,
    []
  >;
}
