import type { Effect } from "effect";

// EXAMPLE PORTS. Replace with your domain's.
//
// A port is what a tool may do to the outside world, as an interface the
// tool context carries (agent-tool-context.ts). The chat endpoint gives the
// tools the real implementations; the agent evals give them fixed answers
// (tests/evals/agent/harness), so no eval reaches a real service. Keep every
// external effect behind a port: it is what makes the agent testable. The
// task and opportunity ports are not examples (tracking-task-ports.ts).

/**
 * A slow external read (a web search, a scraper, a partner API): it reports
 * progress while it runs, and its result can be long.
 */
export interface WebSearch {
  search: (
    query: string,
    maxResults: number,
    onProgress: (progress: { done: number; of: number }) => void
  ) => Effect.Effect<{ title: string; url: string; snippet: string }[], Error>;
}

/**
 * An action in the user's name that cannot be taken back: it always waits
 * for the user's approval card (agent-tool-traits.ts "approval").
 */
export interface EmailSender {
  send: (email: {
    to: string;
    subject: string;
    body: string;
  }) => Effect.Effect<{ sent: true; id: string }, Error>;
}
