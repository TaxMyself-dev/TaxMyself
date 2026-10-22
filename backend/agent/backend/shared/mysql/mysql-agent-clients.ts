import { createClient } from "@supabase/supabase-js";
import { Predicate } from "effect";

import type { Database } from "../../../src/lib/supabase/supabase-database";
import type { AgentSqlDatabase } from "./mysql-agent-database";
import type { AgentGatewayScope } from "./mysql-agent-scope";
import { createMysqlPostgrestFetch } from "./mysql-postgrest-fetch";

// The supabase-js clients the agent's code queries with, over the MySQL
// gateway (mysql-postgrest-fetch.ts) instead of a Supabase project: the same
// client type, the same query builder, the same typed tables
// (src/lib/supabase), so every query in the template's code runs unchanged.
// A user's client answers auth.getClaims() with the user the request was
// verified as (KeepInTax's Firebase auth, in the Nest backend), the one
// session fact the template's code reads.

// supabase-js needs a URL to build its requests on; the gateway answers them
// all, so nothing is ever sent to it.
const gatewayUrl = "https://keepintax-agent.mysql";
const gatewayKey = "mysql-gateway";

const createGatewayClient = (
  database: AgentSqlDatabase,
  scope: AgentGatewayScope
) =>
  createClient<Database>(gatewayUrl, gatewayKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { retry: false },
    global: { fetch: createMysqlPostgrestFetch(database, scope) },
  });

/**
 * A supabase-js client typed with the agent's database.
 */
export type AgentDatabaseClient = ReturnType<typeof createGatewayClient>;

/**
 * The signed-in user's client: every query reaches only their rows, and
 * auth.getClaims() answers with them.
 *
 * @param database - The agent's MySQL database.
 * @param userId - The agent's id for the user (agent_users).
 * @returns The client.
 */
export const createUserDatabaseClient = (
  database: AgentSqlDatabase,
  userId: string
): AgentDatabaseClient => {
  const client = createGatewayClient(database, { role: "user", userId });

  Object.assign(client.auth, {
    getClaims: async () =>
      await Promise.resolve({
        data: { claims: { sub: userId, role: "authenticated" } },
        error: null,
      }),
  });

  return client;
};

/**
 * The service client (the template's service role), which reaches every
 * user's rows: only for modules that expose narrow operations over it (the
 * task monitor's TaskMonitorStore).
 *
 * @param database - The agent's MySQL database.
 * @returns The client.
 */
export const createServiceDatabaseClient = (database: AgentSqlDatabase) =>
  createGatewayClient(database, { role: "service" });

/**
 * The agent's id for a Firebase user (agent_users), created on their first
 * request together with their settings row, as the template's signup
 * trigger creates it (create_user_settings_on_signup), so reading settings
 * never writes.
 *
 * @param database - The agent's MySQL database.
 * @param firebaseId - The verified Firebase uid.
 * @returns The agent's user id.
 */
export const resolveAgentUserId = async (
  database: AgentSqlDatabase,
  firebaseId: string
) => {
  const read = async () => {
    const { rows } = await database.query(
      "SELECT id FROM agent_users WHERE firebase_id = ?",
      [firebaseId]
    );

    return rows[0]?.id;
  };

  const existing = await read();

  if (Predicate.isString(existing)) {
    return existing;
  }

  await database.transaction(async (executor) => {
    await executor.query(
      "INSERT INTO agent_users (id, firebase_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id",
      [crypto.randomUUID(), firebaseId]
    );
    await executor.query(
      `INSERT INTO user_settings (user_id)
       SELECT id FROM agent_users WHERE firebase_id = ?
       ON DUPLICATE KEY UPDATE user_id = user_settings.user_id`,
      [firebaseId]
    );
  });

  const created = await read();

  if (!Predicate.isString(created)) {
    throw new TypeError(
      `AGENT_USER_UNRESOLVED: no agent user for ${firebaseId}`
    );
  }

  return created;
};
