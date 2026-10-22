/**
 * Whose rows a database client reaches through the MySQL gateway: the
 * signed-in user's (the template's row level security), or every user's
 * (the task monitor's service client, the template's service role).
 */
export type AgentGatewayScope =
  | { readonly role: "user"; readonly userId: string }
  | { readonly role: "service" };
