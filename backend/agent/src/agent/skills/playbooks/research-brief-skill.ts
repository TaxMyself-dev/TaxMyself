import type { AgentSkill } from "../registry/agent-skills";

// EXAMPLE playbook written as a goal, its sources and when it is done, not a
// recipe: the model plans the steps itself, and the "done when" list is
// what the answer is checked against. This shape held up better in evals
// than numbered steps for flows with several sources.
export const researchBriefSkill = {
  name: "research-brief",
  description:
    'The user wants a short research brief on a topic, company or market ("תעשה לי מחקר על…", "research X for me"), not a single fact one search answers.',
  content: `# Research brief

Goal: the user gets a short, sourced brief on the topic, and a way to act on it.

Sources: searchWeb with 2 or 3 different queries in one step, side by side; the user's own tasks (listTrackingTasks) when the topic touches them. Nothing else.

Done when:
- every query ran, or its failure is said in one line;
- the brief leads with the 3 to 5 findings that matter most to the user, each with its source link, and says plainly what was not found;
- the same fact from two sources is named once, with both links;
- after the brief, one line offers a task to keep tracking the topic (createTrackingTask) or to email the brief (sendEmail); create or send only after the user agrees.

Never: state a number, name or date no search returned.`,
} as const satisfies AgentSkill;
