import { Schema } from "effect";

import { agentActionRulesSchema } from "@/lib/settings/agent-actions/agent-action-rules";
import { trackingTaskScanFrequencies } from "@/lib/tasks/tracking-task-schema";

// The user's settings, one section per settings page: who they are
// (profile), what they are after in general (preferences), and what the
// agent may do on its own (automation). Stored in Supabase's user_settings,
// one column per setting; the pages read and write only through this
// module. EXAMPLE fields: keep the shape (the agent reads them in its user
// context, agent-user-context.ts, and saves them with updateUserSettings),
// and use your product's fields.
//
// Settings hold only what the user knows and the AI cannot work out. The
// monitor scores every task's items with the preferences
// (backend/monitor/scoring):
// - areas apply only when the task leaves its location empty;
// - notRelevant always adds to what the task rules out.

// Private users and businesses, the spec's Personal and Business agents.
const userProfileKinds = ["individual", "business"] as const;

const userProfileLanguages = ["he", "en", "ar", "ru", "es"] as const;

const userProfileSchema = Schema.Struct({
  kind: Schema.Literals(userProfileKinds),
  // The business name; a private user's own name goes to agent memory.
  name: Schema.String.check(Schema.isMaxLength(120)),
  website: Schema.String.check(Schema.isMaxLength(300)),
  // Languages the user speaks.
  languages: Schema.Array(Schema.Literals(userProfileLanguages)),
});

/**
 * Who the user is: personal or business, their name, website and languages.
 */
export type UserProfile = typeof userProfileSchema.Type;

const userPreferencesSchema = Schema.Struct({
  // What the user is looking for, in their own words.
  seeking: Schema.String.check(Schema.isMaxLength(1000)),
  // What the user never wants to see as a match.
  notRelevant: Schema.String.check(Schema.isMaxLength(1000)),
  // What the user does or offers.
  offer: Schema.String.check(Schema.isMaxLength(1000)),
  // The areas or cities the user works in or searches.
  areas: Schema.String.check(Schema.isMaxLength(300)),
  // The voice of emails and drafts the agent writes.
  writingStyle: Schema.String.check(Schema.isMaxLength(1000)),
});

/**
 * What the user is after in general: what they seek and offer, what is not
 * relevant, their areas, and how the agent writes for them.
 */
export type UserPreferences = typeof userPreferencesSchema.Type;

const userAutomationSchema = Schema.Struct({
  // How often new tasks scan.
  scanFrequency: Schema.Literals(trackingTaskScanFrequencies),
  // What the agent may do on its own (agent-action-rules.ts).
  agentActionRules: agentActionRulesSchema,
});

/**
 * How often new tasks scan, and what the agent may do on its own.
 */
export type UserAutomation = typeof userAutomationSchema.Type;

export const userSettingsSchema = Schema.Struct({
  profile: userProfileSchema,
  preferences: userPreferencesSchema,
  automation: userAutomationSchema,
});

/**
 * All of the user's settings: their profile, preferences and automation.
 */
export type UserSettings = typeof userSettingsSchema.Type;

// A change to a profile or preference field: what the agent's
// updateUserSettings saves.
export const userProfileSettingChangeSchema = Schema.Union([
  Schema.Struct({
    field: Schema.Literal("kind"),
    value: userProfileSchema.fields.kind,
  }),
  Schema.Struct({
    field: Schema.Literal("name"),
    value: userProfileSchema.fields.name,
  }),
  Schema.Struct({
    field: Schema.Literal("website"),
    value: userProfileSchema.fields.website,
  }),
  Schema.Struct({
    field: Schema.Literal("languages"),
    value: userProfileSchema.fields.languages,
  }),
  Schema.Struct({
    field: Schema.Literal("seeking"),
    value: userPreferencesSchema.fields.seeking,
  }),
  Schema.Struct({
    field: Schema.Literal("notRelevant"),
    value: userPreferencesSchema.fields.notRelevant,
  }),
  Schema.Struct({
    field: Schema.Literal("offer"),
    value: userPreferencesSchema.fields.offer,
  }),
  Schema.Struct({
    field: Schema.Literal("areas"),
    value: userPreferencesSchema.fields.areas,
  }),
  Schema.Struct({
    field: Schema.Literal("writingStyle"),
    value: userPreferencesSchema.fields.writingStyle,
  }),
  Schema.Struct({
    field: Schema.Literal("scanFrequency"),
    value: userAutomationSchema.fields.scanFrequency,
  }),
]);

// The agent's action rules, saved together (one column).
const userAgentActionRulesChangeSchema = Schema.Struct({
  field: Schema.Literal("agentActionRules"),
  value: agentActionRulesSchema,
});

// One autosaved field. Each change writes only its own column, so changes
// from two tabs never overwrite each other's fields.
export const userSettingChangeSchema = Schema.Union([
  ...userProfileSettingChangeSchema.members,
  userAgentActionRulesChangeSchema,
]);

/**
 * One settings field's new value, as userSettingChangeSchema describes it.
 */
export type UserSettingChange = typeof userSettingChangeSchema.Type;
