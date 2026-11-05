import type {
  ExpenseQuery,
  ExpenseQueryAnswer,
} from "@/agent/core/ports/keepintax-ports";

/**
 * KeepInTax's side of the agent's domain ports, as the Nest backend gives it
 * with each request (backend/src/agent-harness/agent-domain.service.ts),
 * already bound to the request's verified user: a method cannot reach
 * another owner's data whatever it is asked. Plain promises, since the
 * backend has no Effect; agent-ports.server.ts turns them into the ports.
 * A failure is an Error whose message starts with its CODE:.
 */
export interface AgentDomain {
  queryExpenses: (query: ExpenseQuery) => Promise<ExpenseQueryAnswer>;
}
