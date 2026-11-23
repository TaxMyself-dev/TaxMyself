import { Effect } from "effect";

import type { EmailSender, WebSearch } from "@/agent/core/ports/example-ports";

// What the simulated users' conversations find (simulated-users.eval.ts):
// the web search and the email sender, faked. EXAMPLE sources: give each of
// your ports a fake that answers the way the real service does.

/**
 * The persona the bookkeeper cases' simulated user plays.
 */
export const chicagoBookkeeperPersona =
  "A bookkeeper in Chicago who works for small businesses.";

/**
 * What the simulated user does with every email's approval card.
 */
export const denyEmailsApprovals =
  "Deny every email: you prefer to write to people yourself.";

// Leads as the web search finds them: two cheap, one that fits a higher
// budget, so a case can change the budget and see a different answer.
const leadResults = [
  {
    title: "Food truck wants a bookkeeper, $300 a month",
    url: "https://example.com/requests/301",
    snippet:
      "Small food truck in Pilsen, weekly receipts, pays up to $300 a month. Contact: tacos@example.com",
  },
  {
    title: "Flower shop needs monthly books, $350",
    url: "https://example.com/requests/302",
    snippet:
      "One-person flower shop in Andersonville, $350 a month. Contact: flowers@example.com",
  },
  {
    title: "Café group, 3 locations, bookkeeping and payroll, $900 a month",
    url: "https://example.com/requests/303",
    snippet:
      "Three cafés in the Loop, 25 staff, pays $900 a month. Contact: books@cafes.example",
  },
];

/**
 * The web search every simulated case reads: the same leads for any query.
 *
 * @returns The web search.
 */
export const createSimulatedWebSearch = (): WebSearch => ({
  search: (_query, maxResults) =>
    Effect.succeed(leadResults.slice(0, maxResults)),
});

/**
 * An email sender that counts what it sent (each case's user denies them).
 *
 * @returns The email sender, and the emails sent.
 */
export const createSimulatedEmail = () => {
  const emailsSent: string[] = [];

  const email: EmailSender = {
    send: (message) =>
      Effect.sync(() => {
        emailsSent.push(message.to);

        return { sent: true as const, id: `email-${emailsSent.length}` };
      }),
  };

  return { email, emailsSent };
};
