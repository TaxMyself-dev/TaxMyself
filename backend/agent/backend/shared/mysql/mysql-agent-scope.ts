/**
 * Whose rows a database client reaches through the MySQL gateway: the
 * signed-in user's (the template's row level security), or every user's
 * (the task monitor's service client, the template's service role).
 *
 * KeepInTax: a user scope's userId is the agent's id for the pair (actor,
 * data owner) — an accountant's agent data about one client is a different
 * agent user from their data about another, or about themselves
 * (resolveAgentUserId). businessNumber is the business the request acts in,
 * verified by the Nest backend as one of the data owner's (null when the
 * owner has several and none is chosen): a new conversation records it. It
 * is not an access boundary — a conversation may cover any of the data
 * owner's businesses.
 */
export type AgentGatewayScope =
  | {
      readonly role: "user";
      readonly userId: string;
      readonly businessNumber: string | null;
    }
  | { readonly role: "service" };
