import type { UserSettings } from "@/lib/settings/user-settings/user-settings-schema";

// The eval users' settings (agent-eval-fixtures.ts): an empty account and a
// small business.

const evalProfile: UserSettings["profile"] = {
  kind: "individual",
  name: "",
  website: "",
  languages: ["en"],
};

const evalAutomation: UserSettings["automation"] = {
  scanFrequency: "hour",
  agentActionRules: {},
};

/**
 * A new user: nothing about them is known yet.
 */
export const emptyEvalSettings: UserSettings = {
  profile: evalProfile,
  preferences: {
    seeking: "",
    notRelevant: "",
    offer: "",
    areas: "",
    writingStyle: "",
  },
  automation: evalAutomation,
};

/**
 * A small business, as most cases assume. EXAMPLE: your typical user.
 */
export const exampleEvalSettings: UserSettings = {
  profile: { ...evalProfile, kind: "business", name: "Northwind Bookkeeping" },
  preferences: {
    seeking: "small businesses that need monthly bookkeeping",
    notRelevant: "one-off tax returns",
    offer: "bookkeeping and payroll for small businesses",
    areas: "Chicago",
    writingStyle: "warm and short",
  },
  automation: evalAutomation,
};
