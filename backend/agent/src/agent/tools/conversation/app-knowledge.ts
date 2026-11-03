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
const appHowItWorks = `KeepInTax keeps the books of Israeli self-employed businesses and their accountants: expenses, income documents, bank and card transactions, and VAT and income-tax reports.

- Tasks: each tracking task is one sentence of what to find. While it is active, the background worker scans its sources on its scan frequency, scores each new item against the task and the user's preferences, and records the matches as opportunities, with an in-app alert when its alerts are on. A task is suggested (waits until the user starts it), active, paused or finished; its sheet shows its last scans.
- Opportunities: what the tasks found, newest first, each with what the person wants, why it fits and its score. The user files each one: new, in progress, replied, closed or irrelevant.
- The agent (this chat): does all of the above in conversation, searches the web, and sends email in the user's name. It asks for approval before deleting tasks (with their opportunities) and before sending email, unless the user chose to always allow that action in the chat. It remembers facts about the user across chats (Settings > Agent memory, where the user can see and delete them). It reads files attached to a message (images, PDF, Word, Excel, PowerPoint, CSV, text) and the user can dictate by voice: the recording becomes text in the message box.`;

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
