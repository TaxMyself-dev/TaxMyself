import type { Effect } from "effect";

import type { KeepInTaxBooks } from "@/agent/core/ports/keepintax-ports";
import type { UserProfileMemory } from "@/agent/core/ports/profile-memory";

// A books read's query and answer, as the Effect port types them.
type PromiseOf<Read> = Read extends (
  query: infer Query
) => Effect.Effect<infer Answer, Error>
  ? (query: Query) => Promise<Answer>
  : never;

/**
 * KeepInTax's side of the agent's domain ports, as the Nest backend gives it
 * with each request (backend/src/agent-harness/agent-domain.service.ts and
 * agent-books.service.ts), already bound to the request's verified user: a
 * method cannot reach another owner's data whatever it is asked. Plain
 * promises, since the backend has no Effect; agent-ports.server.ts turns
 * them into the ports. A failure is an Error whose message starts with its
 * CODE:.
 */
export type AgentDomain = {
  profile?: UserProfileMemory;

  // Optional Keepintax onboarding context, bound to the verified owner.
  readOnboardingContext?: (businessNumber: string | null) => Promise<string>;
} & {
  [Read in keyof KeepInTaxBooks]: PromiseOf<KeepInTaxBooks[Read]>;
};
