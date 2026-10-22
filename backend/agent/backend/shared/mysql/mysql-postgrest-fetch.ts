import { Option, Predicate, Schema } from "effect";

import type {
  AgentSqlDatabase,
  AgentSqlExecutor,
  AgentSqlParameter,
  AgentSqlRow,
  AgentSqlValue,
} from "./mysql-agent-database";
import {
  permissionDeniedError,
  PostgrestGatewayError,
  rowLevelSecurityError,
} from "./mysql-agent-errors";
import { agentDatabaseFunction } from "./mysql-agent-functions";
import type { AgentGatewayScope } from "./mysql-agent-scope";
import { agentTable } from "./mysql-agent-tables";
import type { AgentTable, AgentTableRelation } from "./mysql-agent-tables";
import { mysqlParameter, postgrestValue } from "./mysql-agent-values";
import {
  numberParameter,
  parseOrder,
  parseSelect,
  parseSelectWithEmbeds,
  parseWhere,
  quoteIdentifier,
} from "./mysql-postgrest-query";
import type {
  SelectedColumn,
  SelectedEmbed,
  SqlCondition,
} from "./mysql-postgrest-query";

// The agent's code talks to its database through supabase-js, as the
// template's does; this fetch answers supabase-js's PostgREST requests from
// KeepInTax's MySQL instead of a Supabase project. Reads, inserts, upserts,
// updates, deletes and rpc calls are answered the way PostgREST answers them
// (rows as JSON, single() and count, its error shape), so every query in the
// template's code runs unchanged.
//
// What Postgres' row level security did, the gateway does for a user's
// client (scope "user"): every read, update and delete is limited to the
// user's rows, every new row is written as theirs, a row that names a
// conversation must name one of theirs, an upsert never takes over another
// user's row, and each table allows only what the template granted
// (mysql-agent-tables.ts). The service scope (the task monitor, the
// template's service role) reaches every user's rows.

/**
 * One row as JSON, by column.
 */
type JsonRow = Record<string, AgentSqlValue>;

const decodeJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

const isJsonRow = (value: AgentSqlValue | undefined): value is JsonRow =>
  Predicate.isObject(value) && !Array.isArray(value);

const isJsonList = Schema.is(Schema.Array(Schema.Json));

const jsonResponse = (
  status: number,
  body: AgentSqlValue,
  headers: Record<string, string> = {}
) => Response.json(body, { status, headers });

// The Prefer header that asks a change to return its rows.
const returnRepresentation = "return=representation";

const emptyResponse = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers });

// MySQL's errors as the Postgres errors PostgREST would answer with.
const mysqlErrorCodes: ReadonlyMap<string, readonly [number, string]> = new Map(
  [
    ["ER_DUP_ENTRY", [409, "23505"]],
    ["ER_CHECK_CONSTRAINT_VIOLATED", [400, "23514"]],
    ["ER_NO_REFERENCED_ROW_2", [409, "23503"]],
    ["ER_NO_REFERENCED_ROW", [409, "23503"]],
    ["ER_ROW_IS_REFERENCED_2", [409, "23503"]],
    ["ER_DATA_TOO_LONG", [400, "22001"]],
    ["ER_BAD_NULL_ERROR", [400, "23502"]],
    ["ER_TRUNCATED_WRONG_VALUE", [400, "22007"]],
    ["ER_INVALID_JSON_TEXT", [400, "22P02"]],
    ["ER_LOCK_DEADLOCK", [409, "40P01"]],
    ["ER_LOCK_WAIT_TIMEOUT", [409, "55P03"]],
  ]
);

const mysqlErrorCode = (error: Error) =>
  Predicate.hasProperty(error, "code") && Predicate.isString(error.code)
    ? error.code
    : "";

const errorResponse = (error: Error) => {
  if (error instanceof PostgrestGatewayError) {
    return jsonResponse(error.status, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: null,
    });
  }

  const code = mysqlErrorCode(error);
  const [status, postgresCode] = mysqlErrorCodes.get(code) ?? [500, "XX000"];

  return jsonResponse(status, {
    code: postgresCode,
    message: error.message,
    details: code === "" ? null : code,
    hint: null,
  });
};

const preferences = (headers: Headers): ReadonlySet<string> =>
  new Set(
    (headers.get("prefer") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "")
  );

const wantsObject = (headers: Headers) =>
  (headers.get("accept") ?? "").startsWith("application/vnd.pgrst.object+json");

// The request's JSON body, or none without one.
const readBody = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Option.Option<AgentSqlValue>> => {
  const body = init?.body ?? (input instanceof Request ? input.body : null);

  if (body === null || body === undefined) {
    return Option.none();
  }

  const text = Predicate.isString(body)
    ? body
    : await new Response(body).text();

  if (text === "" || text === "undefined") {
    return Option.none();
  }

  return Option.some(
    Option.getOrThrowWith(
      decodeJson(text),
      () => new PostgrestGatewayError(400, "PGRST102", "invalid JSON body")
    )
  );
};

const selectList = (columns: readonly SelectedColumn[]) =>
  columns
    .map(
      ({ column, as }) => `${quoteIdentifier(column)} AS ${quoteIdentifier(as)}`
    )
    .join(", ");

const columnKindOf = (table: AgentTable, column: string) =>
  new Map(Object.entries(table.columns)).get(column) ?? "text";

// A row read back, its columns as PostgREST writes them.
const postgrestRow = (
  table: AgentTable,
  columns: readonly SelectedColumn[],
  row: AgentSqlRow
): JsonRow =>
  Object.fromEntries(
    columns.map(({ column, as }) => [
      as,
      postgrestValue(columnKindOf(table, column), row[as]),
    ])
  );

// The rows whose primary keys are these tuples.
const primaryKeyCondition = (
  table: AgentTable,
  keys: readonly (readonly AgentSqlParameter[])[]
): SqlCondition => {
  if (keys.length === 0) {
    return { sql: "FALSE", params: [] };
  }

  const columns = table.primaryKey.map(quoteIdentifier);

  if (columns.length === 1) {
    return {
      sql: `${columns[0]} IN (${keys.map(() => "?").join(", ")})`,
      params: keys.map((key) => key[0] ?? null),
    };
  }

  const tuple = `(${columns.map(() => "?").join(", ")})`;
  const tuples = keys.map(() => tuple).join(", ");

  return {
    sql: `(${columns.join(", ")}) IN (${tuples})`,
    params: keys.flat(),
  };
};

const primaryKeyColumns = (table: AgentTable): SelectedColumn[] =>
  table.primaryKey.map((column) => ({ column, as: column }));

const keyOfRow = (table: AgentTable, row: JsonRow | AgentSqlRow) =>
  table.primaryKey.map((column) =>
    mysqlParameter(columnKindOf(table, column), row[column])
  );

// The primary keys of the rows a query's filters match, locked for the
// change that follows.
const lockMatchingKeys = async (
  executor: AgentSqlExecutor,
  name: string,
  table: AgentTable,
  where: SqlCondition
) => {
  const { rows } = await executor.query(
    `SELECT ${selectList(primaryKeyColumns(table))} FROM ${quoteIdentifier(name)} WHERE ${where.sql} FOR UPDATE`,
    where.params
  );

  return rows.map((row) => keyOfRow(table, row));
};

// The rows with these primary keys, as PostgREST answers a change with
// return=representation.
const readRowsByKey = async (
  executor: AgentSqlExecutor,
  name: string,
  table: AgentTable,
  columns: readonly SelectedColumn[],
  keys: readonly (readonly AgentSqlParameter[])[]
) => {
  if (keys.length === 0) {
    return [];
  }

  const condition = primaryKeyCondition(table, keys);

  const { rows } = await executor.query(
    `SELECT ${selectList(columns)} FROM ${quoteIdentifier(name)} WHERE ${condition.sql}`,
    condition.params
  );

  return rows.map((row) => postgrestRow(table, columns, row));
};

// The conversations rows name must all be the user's (the template's
// "with check" on the chat's tables).
const assertOwnedConversations = async (
  executor: AgentSqlExecutor,
  name: string,
  userId: string,
  conversationIds: readonly (AgentSqlValue | undefined)[]
) => {
  const ids = [
    ...new Set(
      conversationIds.filter(
        (id): id is string => Predicate.isString(id) && id !== ""
      )
    ),
  ];

  if (ids.length === 0) {
    return;
  }

  const { rows } = await executor.query(
    `SELECT id FROM agent_chat_conversations WHERE user_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
    [userId, ...ids]
  );

  if (rows.length !== ids.length) {
    throw rowLevelSecurityError(name);
  }
};

const assertColumns = (name: string, table: AgentTable, row: JsonRow) => {
  for (const column of Object.keys(row)) {
    if (!Object.hasOwn(table.columns, column)) {
      throw new PostgrestGatewayError(
        400,
        "PGRST204",
        `Could not find the '${column}' column of '${name}' in the schema cache`
      );
    }
  }
};

// One table request's settings.
interface TableRequest {
  readonly name: string;
  readonly table: AgentTable;
  readonly url: URL;
  readonly headers: Headers;
  readonly scope: AgentGatewayScope;
}

const ownerIdOf = (scope: AgentGatewayScope) =>
  scope.role === "user" ? scope.userId : null;

const assertUserAccess = (
  request: TableRequest,
  allowed: (access: AgentTable["user"]) => boolean
) => {
  if (request.scope.role === "user" && !allowed(request.table.user)) {
    throw permissionDeniedError(request.name);
  }
};

// The answer to a read or a change that returns rows: an array, or one
// object for single() (PGRST116 unless exactly one row).
const rowsResponse = (
  request: TableRequest,
  status: number,
  rows: readonly JsonRow[],
  headers: Record<string, string> = {}
) => {
  if (!wantsObject(request.headers)) {
    return jsonResponse(status, rows, headers);
  }

  const [row] = rows;

  return rows.length === 1 && row !== undefined
    ? jsonResponse(status, row, headers)
    : jsonResponse(406, {
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
        details: `The result contains ${rows.length} rows`,
        hint: null,
      });
};

const contentRange = (offset: number, shown: number, total: number | null) => {
  const of = total === null ? "*" : String(total);

  return shown === 0 ? `*/${of}` : `${offset}-${offset + shown - 1}/${of}`;
};

// The value a row holds for a relation's column: the column read, or the
// join column read for it.
const relationValue = (row: JsonRow, column: string) =>
  row[column] ?? row[`__join_${column}`] ?? null;

const relationKey = (row: JsonRow, columns: readonly string[]) =>
  JSON.stringify(columns.map((column) => relationValue(row, column)));

// The related rows an embed reads, by the key they answer for, scoped to
// the user as Postgres' policies would.
const readRelatedRows = async (
  database: AgentSqlDatabase,
  request: TableRequest,
  relation: AgentTableRelation,
  related: AgentTable,
  columns: readonly SelectedColumn[],
  rows: readonly JsonRow[]
) => {
  const tuples = new Map<string, AgentSqlParameter[]>();

  for (const row of rows) {
    const values = relation.references.map((reference, index) =>
      mysqlParameter(
        columnKindOf(related, reference),
        relationValue(row, relation.columns[index] ?? "")
      )
    );

    if (values.every((value) => value !== null)) {
      tuples.set(JSON.stringify(values), values);
    }
  }

  const found = new Map<string, JsonRow>();

  if (tuples.size === 0) {
    return found;
  }

  const ownerId = ownerIdOf(request.scope);
  const scoped = ownerId !== null && related.owner !== null;

  const ownerSql = scoped
    ? ` AND ${quoteIdentifier(related.owner ?? "")} = ?`
    : "";

  const tuple = `(${relation.references.map(() => "?").join(", ")})`;
  const referenced = relation.references.map(quoteIdentifier).join(", ");
  const list = [...tuples.values()].map(() => tuple).join(", ");

  const { rows: relatedRows } = await database.query(
    `SELECT ${selectList(columns)} FROM ${quoteIdentifier(relation.table)} WHERE (${referenced}) IN (${list})${ownerSql}`,
    [...[...tuples.values()].flat(), ...(scoped ? [ownerId] : [])]
  );

  for (const relatedRow of relatedRows) {
    const value = postgrestRow(related, columns, relatedRow);
    found.set(relationKey(value, relation.references), value);
  }

  return found;
};

// One embed's related object for each row: the related row for a
// many-to-one relation, or null when there is none (or the user may not read
// it, as Postgres' policies would hide it).
const embedRelation = async (
  database: AgentSqlDatabase,
  request: TableRequest,
  embed: SelectedEmbed,
  rows: readonly JsonRow[]
): Promise<(JsonRow | null)[]> => {
  const relation = request.table.relations?.[embed.relation];

  const related =
    relation === undefined ? undefined : agentTable(relation.table);

  if (relation === undefined || related === undefined) {
    return rows.map(() => null);
  }

  if (request.scope.role === "user" && !related.user.select) {
    throw permissionDeniedError(relation.table);
  }

  const shown = parseSelect(relation.table, related, embed.select);

  const joined = relation.references
    .filter((column) => !shown.some((item) => item.as === column))
    .map((column) => ({ column, as: `__join_${column}` }));

  const found = await readRelatedRows(
    database,
    request,
    relation,
    related,
    [...shown, ...joined],
    rows
  );

  return rows.map((row) => {
    const match = found.get(relationKey(row, relation.columns));

    return match === undefined
      ? null
      : Object.fromEntries(shown.map(({ as }) => [as, match[as] ?? null]));
  });
};

// The rows with each embed filled in and the join columns read for them
// left out.
const withEmbeds = async (
  database: AgentSqlDatabase,
  request: TableRequest,
  embeds: readonly SelectedEmbed[],
  joinColumns: readonly SelectedColumn[],
  rows: readonly JsonRow[]
) => {
  const embedded = await Promise.all(
    embeds.map(
      async (embed) => await embedRelation(database, request, embed, rows)
    )
  );

  const hidden = new Set(joinColumns.map(({ as }) => as));

  return rows.map((row, index) => ({
    ...Object.fromEntries(
      Object.entries(row).filter(([column]) => !hidden.has(column))
    ),
    ...Object.fromEntries(
      embeds.map((embed, embedIndex) => [
        embed.as,
        embedded[embedIndex]?.[index] ?? null,
      ])
    ),
  }));
};

// LIMIT and OFFSET as PostgREST's limit and offset parameters set them.
const pagingSql = (limit: number | null, offset: number) => {
  if (limit !== null) {
    return offset > 0 ? ` LIMIT ${limit} OFFSET ${offset}` : ` LIMIT ${limit}`;
  }

  return offset > 0 ? ` LIMIT 18446744073709551615 OFFSET ${offset}` : "";
};

const countRows = async (
  database: AgentSqlDatabase,
  name: string,
  where: SqlCondition
) => {
  const { rows } = await database.query(
    `SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)} WHERE ${where.sql}`,
    where.params
  );

  return Number(rows[0]?.count ?? 0);
};

const readTable = async (
  database: AgentSqlDatabase,
  request: TableRequest,
  head: boolean
) => {
  assertUserAccess(request, (access) => access.select);
  const { name, table, url, headers } = request;

  const { columns: shown, embeds } = parseSelectWithEmbeds(
    name,
    table,
    url.searchParams.get("select")
  );

  // An embed joins on the relation's columns, read even when not shown.
  const joinColumns = embeds
    .flatMap(({ relation }) => table.relations?.[relation]?.columns ?? [])
    .filter((column) => !shown.some((item) => item.as === column))
    .map((column) => ({ column, as: `__join_${column}` }));

  const columns = [...shown, ...joinColumns];
  const where = parseWhere(name, table, url, ownerIdOf(request.scope));
  const order = parseOrder(name, table, url.searchParams.get("order"));
  const limit = numberParameter(url, "limit");
  const offset = numberParameter(url, "offset") ?? 0;

  const counted = preferences(headers).has("count=exact")
    ? await countRows(database, name, where)
    : null;

  if (head) {
    return emptyResponse(200, {
      "content-range": contentRange(0, 0, counted),
    });
  }

  const orderSql = order === "" ? "" : ` ORDER BY ${order}`;

  const { rows } = await database.query(
    `SELECT ${selectList(columns)} FROM ${quoteIdentifier(name)} WHERE ${where.sql}${orderSql}${pagingSql(limit, offset)}`,
    where.params
  );

  const read = await withEmbeds(
    database,
    request,
    embeds,
    joinColumns,
    rows.map((row) => postgrestRow(table, columns, row))
  );

  return rowsResponse(request, 200, read, {
    "content-range": contentRange(offset, read.length, counted),
  });
};

// A request's rows to insert, each checked against the table, written as
// the user's when it is theirs, and given its generated uuids.
const rowsToInsert = (
  request: TableRequest,
  body: AgentSqlValue | undefined
) => {
  const { name, table, scope } = request;
  const given = isJsonList(body) ? body : [body ?? null];

  return given.map((value) => {
    if (!isJsonRow(value)) {
      throw new PostgrestGatewayError(400, "PGRST102", "rows must be objects");
    }

    assertColumns(name, table, value);
    const row: JsonRow = Object.fromEntries(Object.entries(value));

    if (scope.role === "user" && table.owner !== null) {
      const owner = row[table.owner];

      if (owner !== undefined && owner !== scope.userId) {
        throw rowLevelSecurityError(name);
      }

      row[table.owner] = scope.userId;
    }

    for (const column of table.generatedUuid) {
      row[column] ??= crypto.randomUUID();
    }

    return row;
  });
};

const conflictColumnsOf = (request: TableRequest) => {
  const { name, table, url } = request;

  const named = (url.searchParams.get("on_conflict") ?? "")
    .split(",")
    .map((column) => column.replaceAll('"', "").trim())
    .filter((column) => column !== "");

  const columns = named.length > 0 ? named : [...table.primaryKey];

  for (const column of columns) {
    if (!Object.hasOwn(table.columns, column)) {
      throw new PostgrestGatewayError(
        400,
        "42703",
        `column ${name}.${column} does not exist`
      );
    }
  }

  return columns;
};

// The INSERT's VALUES list and parameters: a row that leaves a column out
// gets its default (missing=default) or null.
const insertValues = (
  table: AgentTable,
  columns: readonly string[],
  rows: readonly JsonRow[],
  missingDefault: boolean
) => {
  const params: AgentSqlParameter[] = [];
  const missing = missingDefault ? "DEFAULT" : "NULL";

  const values = rows
    .map((row) => {
      const items = columns.map((column) => {
        const value = row[column];

        if (value === undefined) {
          return missing;
        }

        params.push(mysqlParameter(columnKindOf(table, column), value));

        return "?";
      });

      return `(${items.join(", ")})`;
    })
    .join(", ");

  return { values, params };
};

// ON DUPLICATE KEY UPDATE for an upsert: merge the given columns, or leave
// the existing row (ignore-duplicates).
const onDuplicateSql = (
  table: AgentTable,
  columns: readonly string[],
  conflictColumns: readonly string[],
  resolution: "merge" | "ignore" | null
) => {
  if (resolution === null) {
    return "";
  }

  const firstKey = quoteIdentifier(table.primaryKey[0] ?? "id");
  const keep = `${firstKey} = ${firstKey}`;

  const updates = columns.flatMap((column) =>
    conflictColumns.includes(column) || column === table.owner
      ? []
      : [`${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`]
  );

  if (resolution === "ignore" || updates.length === 0) {
    return ` ON DUPLICATE KEY UPDATE ${keep}`;
  }

  return ` ON DUPLICATE KEY UPDATE ${updates.join(", ")}`;
};

const upsertResolution = (prefer: ReadonlySet<string>) => {
  if (prefer.has("resolution=merge-duplicates")) {
    return "merge";
  }

  return prefer.has("resolution=ignore-duplicates") ? "ignore" : null;
};

// An upsert takes over no other user's row: Postgres' policies would refuse
// its update.
const assertNoTakeover = async (
  executor: AgentSqlExecutor,
  request: TableRequest,
  conflictColumns: readonly string[],
  rows: readonly JsonRow[]
) => {
  const { name, table, scope } = request;

  if (scope.role !== "user" || table.owner === null) {
    return;
  }

  const tuples = rows.map((row) =>
    conflictColumns.map((column) =>
      mysqlParameter(columnKindOf(table, column), row[column])
    )
  );

  const tuple = `(${conflictColumns.map(() => "?").join(", ")})`;
  const columns = conflictColumns.map(quoteIdentifier).join(", ");
  const list = tuples.map(() => tuple).join(", ");

  const { rows: taken } = await executor.query(
    `SELECT 1 FROM ${quoteIdentifier(name)} WHERE (${columns}) IN (${list}) AND ${quoteIdentifier(table.owner)} <> ? LIMIT 1`,
    [...tuples.flat(), scope.userId]
  );

  if (taken.length > 0) {
    throw rowLevelSecurityError(name);
  }
};

const insertRows = async (
  database: AgentSqlDatabase,
  request: TableRequest,
  body: AgentSqlValue | undefined
) => {
  assertUserAccess(request, (access) => access.insert);
  const { name, table, url, headers, scope } = request;
  const prefer = preferences(headers);
  const resolution = upsertResolution(prefer);
  const rows = rowsToInsert(request, body);

  if (rows.length === 0) {
    return jsonResponse(201, []);
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const conflictColumns = conflictColumnsOf(request);
  const keys = rows.map((row) => keyOfRow(table, row));

  const { values, params } = insertValues(
    table,
    columns,
    rows,
    prefer.has("missing=default")
  );

  const onDuplicate = onDuplicateSql(
    table,
    columns,
    conflictColumns,
    resolution
  );

  const columnList = columns.map(quoteIdentifier).join(", ");

  const returned = await database.transaction(async (executor) => {
    if (scope.role === "user" && table.ownedConversation) {
      await assertOwnedConversations(
        executor,
        name,
        scope.userId,
        rows.map((row) => row.conversation_id)
      );
    }

    if (resolution !== null) {
      await assertNoTakeover(executor, request, conflictColumns, rows);
    }

    await executor.query(
      `INSERT INTO ${quoteIdentifier(name)} (${columnList}) VALUES ${values}${onDuplicate}`,
      params
    );

    return prefer.has(returnRepresentation)
      ? await readRowsByKey(
          executor,
          name,
          table,
          parseSelect(name, table, url.searchParams.get("select")),
          keys
        )
      : null;
  });

  return returned === null
    ? emptyResponse(201)
    : rowsResponse(request, 201, returned);
};

// Whether the user's grant covers every changed column.
const updateAllowed =
  (changed: readonly string[]) => (access: AgentTable["user"]) => {
    const { update } = access;

    return (
      update === true ||
      (Array.isArray(update) &&
        changed.every((column) => update.includes(column)))
    );
  };

const updateRows = async (
  database: AgentSqlDatabase,
  request: TableRequest,
  body: AgentSqlValue | undefined
) => {
  const { name, table, url, headers, scope } = request;

  if (!isJsonRow(body)) {
    throw new PostgrestGatewayError(
      400,
      "PGRST102",
      "the change must be an object"
    );
  }

  assertColumns(name, table, body);
  const changed = Object.keys(body);
  assertUserAccess(request, updateAllowed(changed));

  if (
    scope.role === "user" &&
    table.owner !== null &&
    body[table.owner] !== undefined &&
    body[table.owner] !== scope.userId
  ) {
    throw rowLevelSecurityError(name);
  }

  const where = parseWhere(name, table, url, ownerIdOf(scope));

  const returned = await database.transaction(async (executor) => {
    if (scope.role === "user" && table.ownedConversation) {
      await assertOwnedConversations(executor, name, scope.userId, [
        body.conversation_id,
      ]);
    }

    const keys = await lockMatchingKeys(executor, name, table, where);

    if (keys.length > 0 && changed.length > 0) {
      const condition = primaryKeyCondition(table, keys);

      const assignments = changed
        .map((column) => `${quoteIdentifier(column)} = ?`)
        .join(", ");

      await executor.query(
        `UPDATE ${quoteIdentifier(name)} SET ${assignments} WHERE ${condition.sql}`,
        [
          ...changed.map((column) =>
            mysqlParameter(columnKindOf(table, column), body[column])
          ),
          ...condition.params,
        ]
      );
    }

    return preferences(headers).has(returnRepresentation)
      ? await readRowsByKey(
          executor,
          name,
          table,
          parseSelect(name, table, url.searchParams.get("select")),
          keys
        )
      : null;
  });

  return returned === null
    ? emptyResponse(204)
    : rowsResponse(request, 200, returned);
};

const deleteRows = async (
  database: AgentSqlDatabase,
  request: TableRequest
) => {
  assertUserAccess(request, (access) => access.delete);
  const { name, table, url, headers, scope } = request;
  const where = parseWhere(name, table, url, ownerIdOf(scope));

  const returned = await database.transaction(async (executor) => {
    const keys = await lockMatchingKeys(executor, name, table, where);

    const deleted = preferences(headers).has(returnRepresentation)
      ? await readRowsByKey(
          executor,
          name,
          table,
          parseSelect(name, table, url.searchParams.get("select")),
          keys
        )
      : null;

    if (keys.length > 0) {
      const condition = primaryKeyCondition(table, keys);
      await executor.query(
        `DELETE FROM ${quoteIdentifier(name)} WHERE ${condition.sql}`,
        condition.params
      );
    }

    return deleted;
  });

  return returned === null
    ? emptyResponse(204)
    : rowsResponse(request, 200, returned);
};

const callFunction = async (
  database: AgentSqlDatabase,
  scope: AgentGatewayScope,
  fnName: string,
  url: URL,
  body: AgentSqlValue | undefined
) => {
  const fn = agentDatabaseFunction(fnName);

  if (fn === undefined) {
    throw new PostgrestGatewayError(
      404,
      "PGRST202",
      `Could not find the function public.${fnName} in the schema cache`
    );
  }

  const args = isJsonRow(body) ? body : Object.fromEntries(url.searchParams);

  return jsonResponse(200, (await fn({ database, scope }, args)) ?? null);
};

const serveTable = async (
  database: AgentSqlDatabase,
  request: TableRequest,
  method: string,
  body: AgentSqlValue | undefined
) => {
  switch (method) {
    case "GET": {
      return await readTable(database, request, false);
    }

    case "HEAD": {
      return await readTable(database, request, true);
    }

    case "POST": {
      return await insertRows(database, request, body);
    }

    case "PATCH": {
      return await updateRows(database, request, body);
    }

    case "DELETE": {
      return await deleteRows(database, request);
    }

    default: {
      throw new PostgrestGatewayError(
        405,
        "PGRST117",
        `Unsupported HTTP method: ${method}`
      );
    }
  }
};

const requestMethod = (input: RequestInfo | URL, init?: RequestInit) =>
  (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();

const serveGatewayRequest = async (
  database: AgentSqlDatabase,
  scope: AgentGatewayScope,
  input: RequestInfo | URL,
  init?: RequestInit
) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());

  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );

  const path = url.pathname.replace(/^.*\/rest\/v1\//u, "");
  const body = Option.getOrUndefined(await readBody(input, init));

  if (path.startsWith("rpc/")) {
    return await callFunction(database, scope, path.slice(4), url, body);
  }

  const table = agentTable(path);

  if (table === undefined) {
    throw new PostgrestGatewayError(
      404,
      "42P01",
      `relation "public.${path}" does not exist`
    );
  }

  return await serveTable(
    database,
    { name: path, table, url, headers, scope },
    requestMethod(input, init),
    body
  );
};

/**
 * A fetch that answers supabase-js's PostgREST requests (/rest/v1/<table>,
 * /rest/v1/rpc/<function>) from the agent's MySQL tables, scoped as the
 * client is.
 *
 * @param database - The agent's MySQL database.
 * @param scope - Whose rows the client reaches.
 * @returns The fetch, for createClient's global.fetch.
 */
export const createMysqlPostgrestFetch =
  (database: AgentSqlDatabase, scope: AgentGatewayScope): typeof fetch =>
  async (input, init) => {
    try {
      return await serveGatewayRequest(database, scope, input, init);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  };
