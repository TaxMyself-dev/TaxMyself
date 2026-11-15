import {
  app_dashboard_intro,
  app_nav_agent,
  app_nav_appearance,
  app_nav_dashboard,
  app_nav_memory,
  app_nav_plan,
  app_nav_preferences,
  app_nav_profile,
  app_nav_settings,
  app_nav_opportunities,
  app_nav_tasks,
  app_opportunities_intro,
  app_tasks_intro,
} from "#/paraglide/messages";
import {
  agentCapabilityLines,
  agentSupportedCapabilities,
  agentUnsupportedCapabilities,
} from "@/agent/core/agent/agent-capabilities";
import { getHelpQuestionGroups } from "@/website/help-question-data";
import { getPricingPlans } from "@/website/pricing-plans-data";

// What the agent knows about KeepInTax itself, read with
// readAppKnowledge: how the parts work together, every page with the line
// it opens with, the settings sections, the plans as the pricing page sells
// them, and the help center's questions and answers. Pages, plans and help
// come from their own definitions (the sidebar's labels, the pages' intro
// lines, pricing-plans-data.ts, help-question-data.ts), so the agent never
// tells a different story than the app; only how the parts work together is
// written here. About 12,000 characters, read whole.

// EXAMPLE: how your product's parts work together, in a few lines each.
// Write only what the pages, plans and help center below do not say.
//
// KeepInTax change (Phase 3.1, plan §2.6): the agent's paragraph comes from
// the supported capabilities (agent-capabilities.ts), and the template's
// paragraphs on tracking tasks and opportunities (hidden from chat, A17) are
// gone. The pages, plans and help below are still the template's examples
// until KeepInTax's help content replaces them (plan §3.1).
const appHowItWorks = `KeepInTax keeps the books of Israeli self-employed businesses and their accountants: expenses, income documents, bank and card transactions, and VAT and income-tax reports.

- The agent (this chat) can:
${agentCapabilityLines(agentSupportedCapabilities)}
- It cannot yet:
${agentCapabilityLines(agentUnsupportedCapabilities)}
- It asks for approval before any action the user's rules say to ask about. It remembers preferences and facts the user states across chats (Settings > Agent memory, where the user can see, correct and delete them).`;

// EXAMPLE pages: every page of your app with its path and intro line.
const appPages = () => [
  {
    name: app_nav_dashboard(),
    path: "/app/agent",
    about: app_dashboard_intro(),
  },
  { name: app_nav_tasks(), path: "/app/tasks", about: app_tasks_intro() },
  {
    name: app_nav_opportunities(),
    path: "/app/opportunities",
    about: app_opportunities_intro(),
  },
  { name: app_nav_agent(), path: "/app/agent", about: "This chat." },
];

// The settings window, opened from the account menu at the bottom of the
// sidebar.
const appSettingsSections = () => [
  app_nav_profile(),
  app_nav_preferences(),
  app_nav_memory(),
  app_nav_appearance(),
  app_nav_plan(),
];

/**
 * What the agent knows about KeepInTax itself: how it works, its pages and
 * settings, in the page's language.
 *
 * @returns The knowledge, as the tool's result.
 */
export const readAppKnowledge = () => ({
  howItWorks: appHowItWorks,
  pages: appPages(),
  settings: {
    openFrom: `${app_nav_settings()}: the account menu at the bottom of the sidebar`,
    sections: appSettingsSections(),
  },
  plans: getPricingPlans().map((plan) => ({
    name: plan.name,
    pricePerMonth: plan.price,
    for: plan.audience,
    includes: plan.features,
  })),
  help: Object.values(getHelpQuestionGroups())
    .flat()
    .map((question) => ({
      question: question.title,
      answer: question.answer,
      bullets: question.bullets,
      href: question.href,
    })),
});
