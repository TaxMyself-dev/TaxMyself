// EXAMPLE help center data: the agent's readAppKnowledge reads it, so the
// agent answers app questions from the same text the help pages show. Load
// it from your help pages' own source, never a copy.

/**
 * One help question as the help center shows it.
 */
export interface HelpQuestion {
  title: string;
  answer: string;
  bullets?: string[];
  // The help page's link, for the agent's answer.
  href: string;
}

// EXAMPLE section: getting started.
const startHelpQuestions: HelpQuestion[] = [
  {
    title: "How do I get started?",
    answer: "Tell the agent what you need; it sets up your first tasks.",
    href: "/help#start",
  },
];

/**
 * The help center's questions, by section.
 *
 * @returns The questions.
 */
export const getHelpQuestionGroups = () => ({ start: startHelpQuestions });
