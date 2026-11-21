import { checkHarnessWork } from "./harness-prompt-rules";

// What the harnessing prompts tell a proposer about the agent's work
// (Harness² BenchPrompts for this agent). It describes the work, never how
// it is measured, and names no case's expectation: a source-to-request
// mapping written here would hand the proposer the answer. EXAMPLE text:
// describe your agent's work and the levers that change it.

export const appHarnessWork = checkHarnessWork({
  work: `The agent is an assistant that works for one user in a chat, in the user's language. It keeps
tracking tasks that scan the user's sources on a schedule and reports what they found
(opportunities), searches the web for them, and sends email in their name only when the user
approves.

Each task here is one conversation: the user's messages, the tool calls the agent made, what the
tools returned, and the answer the user saw. With every message the agent also reads the user's
saved settings (such as their area and line of work) and memories; those are not shown here.`,
  domainWord: "area of work",
  deliverableWord: "answer",
  invLevers: `The levers for how the agent works here: which tool it reaches for first for a kind of request;
loading a deferred tool's namespace through tool search before calling it; the filters it passes;
how many results it fetches against how many the user asked for; what it does when a tool returns
fewer results than asked, an error, or nothing; when it asks the user instead of guessing; and when
it stops and answers.`,
  domLevers: `The knowledge of someone who does this work for a living: which sources serve which kind of
request and which do not, what a useful result must include for the user to act on it, and what
the user's own words limit -- their place, budget, number of results, and any source they named or
excluded.`,
  yardstick: "",
});
