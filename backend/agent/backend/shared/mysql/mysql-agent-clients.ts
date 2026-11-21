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
 * @param userId - The agent's id for the user (agent_users): the pair
 *   (actor, data owner), resolveAgentUserId.
 * @param businessNumber - The business the request acts in, verified by the
 *   Nest backend as the data owner's (null when none is chosen); a new
 *   conversation records it.
 * @returns The client.
 */
export const createUserDatabaseClient = (
  database: AgentSqlDatabase,
  userId: string,
  businessNumber: string | null
): AgentDatabaseClient => {
  const client = createGatewayClient(database, {
    role: "user",
    userId,
    businessNumber,
  });

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
 * The agent's id for the pair (actor, data owner) (agent_users), created on
 * its first request together with its settings row, as the template's
 * signup trigger creates it (create_user_settings_on_signup), so reading
 * settings never writes.
 *
 * KeepInTax: the agent's user is the person acting together with the data
 * owner they act on — themselves, or the client an accountant (or an admin)
 * represents. Each pair has its own conversations, memory, settings and
 * tasks, so what the agent learned about one client never reaches another.
 * Rows from before this pairing (data_owner_firebase_id NULL) are never
 * matched: their owner is unknown, so they are kept but not served
 * (2026-11-05_agent_actor_owner_scope.sql).
 *
 * @param database - The agent's MySQL database.
 * @param actorFirebaseId - The verified Firebase uid of the person acting.
 * @param dataOwnerFirebaseId - The Firebase uid whose data the request
 *   acts on, as the Nest backend authorized it.
 * @returns The agent's user id.
 */
export const resolveAgentUserId = async (
  database: AgentSqlDatabase,
  actorFirebaseId: string,
  dataOwnerFirebaseId: string
) => {
  const pair = [actorFirebaseId, dataOwnerFirebaseId];

  const read = async () => {
    const { rows } = await database.query(
      "SELECT id FROM agent_users WHERE firebase_id = ? AND data_owner_firebase_id = ?",
      pair
    );

    return rows[0]?.id;
  };

  const existing = await read();

  if (Predicate.isString(existing)) {
    return existing;
  }

  await database.transaction(async (executor) => {
    await executor.query(
      "INSERT INTO agent_users (id, firebase_id, data_owner_firebase_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id",
      [crypto.randomUUID(), ...pair]
    );
    await executor.query(
      `INSERT INTO user_settings (user_id)
       SELECT id FROM agent_users WHERE firebase_id = ? AND data_owner_firebase_id = ?
       ON DUPLICATE KEY UPDATE user_id = user_settings.user_id`,
      pair
    );
  });

  const created = await read();

  if (!Predicate.isString(created)) {
    throw new TypeError(
      `AGENT_USER_UNRESOLVED: no agent user for ${actorFirebaseId} acting on ${dataOwnerFirebaseId}`
    );
  }

  return created;
};
