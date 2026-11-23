import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import { createPool } from "mysql2/promise";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { DatabaseNotConfiguredError } from "./mysql-agent-database-error";

// KeepInTax's MySQL, which holds the agent's tables
// (backend/scripts/migrations/2026-10-22_agent_harness_schema.sql) beside the
// app's own. The pool is the backend's database (DB_HOST, DB_PORT,
// DB_USERNAME, DB_PASSWORD, DB_DATABASE, the same keys the Nest app reads);
// AGENT_DB_* overrides each one, for an agent pointed at another database.
// Every connection runs in UTC and reads DATETIME as text, so times pass
// through unchanged (mysql-agent-values.ts).

/**
 * A value MySQL hands back: text (DATETIME too, read as text), a number, null,
 * or a JSON column's value.
 */
export type AgentSqlValue = Schema.Json;

/**
 * One row MySQL read, by column.
 */
export type AgentSqlRow = Readonly<Record<string, AgentSqlValue>>;

/**
 * A statement's parameter: text, a number or null (JSON columns take their
 * JSON as text).
 */
export type AgentSqlParameter = string | number | null;

/**
 * One SQL statement's result: the rows it read, and how many it changed.
 */
export interface AgentSqlResult {
  readonly rows: readonly AgentSqlRow[];
  readonly affectedRows: number;
}

/**
 * Runs SQL: a pool connection, or one inside a transaction.
 */
export interface AgentSqlExecutor {
  readonly query: (
    sql: string,
    params?: readonly AgentSqlParameter[]
  ) => Promise<AgentSqlResult>;
}

/**
 * The database: statements on the pool, and transactions.
 */
export interface AgentSqlDatabase extends AgentSqlExecutor {
  // Runs work in one transaction: committed when it settles, rolled back when
  // it throws.
  readonly transaction: <A>(
    work: (executor: AgentSqlExecutor) => Promise<A>
  ) => Promise<A>;
}

// The longest one statement may run, as the template capped each database
// request of its service client (AbortSignal.timeout(30_000)): a hung query
// fails instead of holding the worker or a request.
const agentSqlTimeoutMs = 30_000;

const decodeAgentSqlRow = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Json)
);

const isResultSetHeader = (
  result: RowDataPacket[] | ResultSetHeader
): result is ResultSetHeader => !Array.isArray(result);

// mysql2's answer as the gateway reads it: a write's count, or a read's rows
// decoded as JSON values (what the pool's settings make every column).
const toAgentSqlResult = (
  result: RowDataPacket[] | ResultSetHeader
): AgentSqlResult =>
  isResultSetHeader(result)
    ? { rows: [], affectedRows: result.affectedRows }
    : {
        rows: result.map((row) => decodeAgentSqlRow({ ...row })),
        affectedRows: 0,
      };

const connectionExecutor = (
  connection: Pick<PoolConnection, "query">
): AgentSqlExecutor => ({
  query: async (sql, params = []) => {
    const [result] = await connection.query<RowDataPacket[] | ResultSetHeader>(
      { sql, timeout: agentSqlTimeoutMs },
      [...params]
    );

    return toAgentSqlResult(result);
  },
});

// A failed rollback leaves the connection to the pool's own cleanup; the
// statement's error is what the caller needs.
const rollbackQuietly = async (connection: PoolConnection) => {
  try {
    await connection.rollback();
  } catch {
    // The original error is rethrown by the caller.
  }
};

/**
 * The SQL database over a mysql2 pool.
 *
 * @param pool - The pool.
 * @returns The database.
 */
export const mysqlAgentSqlDatabase = (pool: Pool): AgentSqlDatabase => ({
  ...connectionExecutor(pool),
  transaction: async (work) => {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const result = await work(connectionExecutor(connection));
      await connection.commit();

      return result;
    } catch (error) {
      await rollbackQuietly(connection);
      throw error;
    } finally {
      connection.release();
    }
  },
});

// The session settings every agent connection runs with (createAgentMysqlPool).
const setUpAgentSession = async (session: Pick<PoolConnection, "query">) => {
  try {
    await session.query(
      "SET time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'"
    );
  } catch (error) {
    console.error(
      "AGENT_DB_SESSION_SETUP_FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
};

/**
 * A pool on the agent's database: utf8mb4, every session in UTC and strict
 * mode, DATETIME read as text (so CURRENT_TIMESTAMP(6) and NOW(6) write UTC
 * times, as Postgres' now() does for a timestamptz, and nothing shifts a
 * time on the way back).
 *
 * @param connection - Where the database is and how to sign in.
 * @returns The pool.
 */
export const createAgentMysqlPool = (connection: {
  host: string;
  port: number;
  user: string;
  password: string | undefined;
  database: string;
}) => {
  const created = createPool({
    ...connection,
    charset: "utf8mb4",
    connectionLimit: 10,
    dateStrings: true,
    supportBigNumbers: true,
    timezone: "Z",
    waitForConnections: true,
  });

  // Every session in UTC, and in MySQL 8's strict mode whatever the server
  // defaults to: a value too long or invalid fails as Postgres fails it,
  // never silently truncated. Queued first, so it runs before any statement
  // on the connection; a failure is logged and the statement after it runs
  // on the server's defaults.
  created.pool.on("connection", (session) => {
    void setUpAgentSession(session.promise());
  });

  return created;
};

const databaseSetting = (name: string) =>
  Config.option(Config.String(`AGENT_${name}`)).pipe(
    Effect.filterOrElse(Option.isSome, () => Config.option(Config.String(name)))
  );

/**
 * The agent's MySQL database, created on first use and shared. Without its
 * configuration the layer still builds, and each use fails with
 * DatabaseNotConfiguredError (DATABASE_NOT_CONFIGURED: …).
 */
export class AgentMysqlDatabase extends Context.Service<
  AgentMysqlDatabase,
  {
    readonly database: Effect.Effect<
      AgentSqlDatabase,
      DatabaseNotConfiguredError
    >;
  }
>()("app/shared/AgentMysqlDatabase") {
  static readonly layer = Layer.effect(
    AgentMysqlDatabase,
    Effect.gen(function* makeAgentMysqlDatabase() {
      const host = yield* Effect.orDie(databaseSetting("DB_HOST"));
      const port = yield* Effect.orDie(databaseSetting("DB_PORT"));
      const user = yield* Effect.orDie(databaseSetting("DB_USERNAME"));
      const database = yield* Effect.orDie(databaseSetting("DB_DATABASE"));

      const password = yield* Effect.orDie(
        Config.option(Config.Redacted("AGENT_DB_PASSWORD")).pipe(
          Effect.filterOrElse(Option.isSome, () =>
            Config.option(Config.Redacted("DB_PASSWORD"))
          )
        )
      );

      let pool: Pool | null = null;

      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          await pool?.end();
        })
      );

      const connected = yield* Effect.cached(
        Effect.suspend(() => {
          if (
            Option.isNone(host) ||
            Option.isNone(user) ||
            Option.isNone(database)
          ) {
            return Effect.fail(
              new DatabaseNotConfiguredError({
                keys: "DB_HOST, DB_USERNAME, DB_PASSWORD and DB_DATABASE",
              })
            );
          }

          return Effect.sync(() => {
            const created = createAgentMysqlPool({
              database: database.value,
              host: host.value,
              password: Option.getOrUndefined(
                Option.map(password, Redacted.value)
              ),
              port: Option.match(port, {
                onNone: () => 3306,
                onSome: Number,
              }),
              user: user.value,
            });

            pool = created;

            return mysqlAgentSqlDatabase(created);
          });
        })
      );

      return AgentMysqlDatabase.of({ database: connected });
    })
  );
}
