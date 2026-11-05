import type { AgentSqlParameter } from "./mysql-agent-database";
import { PostgrestGatewayError } from "./mysql-agent-errors";
import type { AgentGatewayScope } from "./mysql-agent-scope";
import type { AgentColumnKind, AgentTable } from "./mysql-agent-tables";
import { mysqlFilterParameter } from "./mysql-agent-values";

// A PostgREST request's query (the URL supabase-js writes: select, filters,
// order, offset and limit) as SQL pieces for one of the agent's tables. Only
// what the agent's code sends is understood, the rest is refused, and every
// column name is checked against the table (mysql-agent-tables.ts), so no
// text from a request reaches SQL except as a parameter.

/**
 * One selected column: its name in the table, and in the answer.
 */
export interface SelectedColumn {
  readonly column: string;
  readonly as: string;
}

/**
 * A related table a select embeds (`tracking_tasks(sentence)`): the relation,
 * the key it answers under, and the columns read from it.
 */
export interface SelectedEmbed {
  readonly relation: string;
  readonly as: string;
  readonly select: string;
}

/**
 * What a select names: its columns and its embeds.
 */
export interface SelectedFields {
  readonly columns: SelectedColumn[];
  readonly embeds: SelectedEmbed[];
}

/**
 * A WHERE clause's text and its parameters.
 */
export interface SqlCondition {
  readonly sql: string;
  readonly params: readonly AgentSqlParameter[];
}

/**
 * A column or table name as a MySQL identifier. Every name comes from the
 * agent's table registry, never from a request.
 *
 * @param name - The name.
 * @returns The quoted name.
 */
export const quoteIdentifier = (name: string) =>
  `\`${name.replaceAll("`", "")}\``;

const columnKind = (
  tableName: string,
  table: AgentTable,
  column: string
): AgentColumnKind => {
  const kind = new Map(Object.entries(table.columns)).get(column);

  if (kind === undefined) {
    throw new PostgrestGatewayError(
      400,
      "42703",
      `column ${tableName}.${column} does not exist`
    );
  }

  return kind;
};

// The select's top-level items: commas inside an embed's parentheses belong
// to it.
const splitSelect = (text: string) => {
  const items: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of text) {
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    }

    if (character === "," && depth === 0) {
      items.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  if (current !== "") {
    items.push(current);
  }

  return items;
};

const embedPattern = /^(?:(?<as>\w+):)?(?<relation>\w+)\((?<select>.*)\)$/u;

// One plain column item: `column` or `alias:column`.
const selectedColumn = (
  tableName: string,
  table: AgentTable,
  item: string
): SelectedColumn => {
  const [first = "", second] = item.replaceAll('"', "").split(":");
  const column = second ?? first;

  columnKind(tableName, table, column);

  return { column, as: second === undefined ? column : first };
};

/**
 * The columns and embeds a select names: `*` for every column, or a list of
 * names, each optionally renamed (`alias:column`), and related tables the
 * table declares (`relation(columns)`).
 *
 * @param tableName - The table's name.
 * @param table - The table.
 * @param select - The select parameter, as supabase-js writes it.
 * @returns The selected columns and embeds.
 */
export const parseSelectWithEmbeds = (
  tableName: string,
  table: AgentTable,
  select: string | null
): SelectedFields => {
  const text = select === null || select === "" ? "*" : select;
  const columns: SelectedColumn[] = [];
  const embeds: SelectedEmbed[] = [];

  for (const item of splitSelect(text)) {
    const embed = embedPattern.exec(item)?.groups;

    if (embed?.relation !== undefined) {
      if (table.relations?.[embed.relation] === undefined) {
        throw new PostgrestGatewayError(
          400,
          "PGRST200",
          `Could not find a relationship between '${tableName}' and '${embed.relation}' in the schema cache`
        );
      }

      embeds.push({
        relation: embed.relation,
        as: embed.as ?? embed.relation,
        select: embed.select ?? "*",
      });
    } else if (item === "*") {
      columns.push(
        ...Object.keys(table.columns).map((column) => ({ column, as: column }))
      );
    } else {
      columns.push(selectedColumn(tableName, table, item));
    }
  }

  return { columns, embeds };
};

/**
 * The columns a select names, where embedding has no place (a change's
 * returned rows): `*` for every column, or a list of names, each optionally
 * renamed (`alias:column`).
 *
 * @param tableName - The table's name.
 * @param table - The table.
 * @param select - The select parameter, as supabase-js writes it.
 * @returns The selected columns.
 */
export const parseSelect = (
  tableName: string,
  table: AgentTable,
  select: string | null
): SelectedColumn[] => {
  const { columns, embeds } = parseSelectWithEmbeds(tableName, table, select);

  if (embeds.length > 0) {
    throw new PostgrestGatewayError(
      400,
      "PGRST100",
      `embedding is only supported when reading ${tableName}`
    );
  }

  return columns;
};

// An in list's items, as supabase-js writes them: `(a,b,"c,d")`, an item
// quoted when it holds a comma or a parenthesis.
const parseInList = (text: string) => {
  if (!text.startsWith("(") || !text.endsWith(")")) {
    throw new PostgrestGatewayError(400, "PGRST100", `invalid in list ${text}`);
  }

  const inner = text.slice(1, -1);
  const items: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of inner) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\" && quoted) {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      items.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  if (inner.length > 0) {
    items.push(current);
  }

  return items;
};

// A like pattern as PostgREST writes it (* for any text) in SQL's terms.
const likePattern = (pattern: string) =>
  pattern
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll("*", "%");

const comparisons: ReadonlyMap<string, string> = new Map([
  ["eq", "="],
  ["neq", "<>"],
  ["gt", ">"],
  ["gte", ">="],
  ["lt", "<"],
  ["lte", "<="],
]);

// One filter's operator and value as SQL, before any `not.`.
const filterCondition = (
  column: string,
  kind: AgentColumnKind,
  operator: string,
  value: string
): SqlCondition => {
  const target = quoteIdentifier(column);
  const comparison = comparisons.get(operator);

  if (comparison !== undefined) {
    return {
      sql: `${target} ${comparison} ?`,
      params: [mysqlFilterParameter(kind, value)],
    };
  }

  switch (operator) {
    case "is": {
      if (value === "null") {
        return { sql: `${target} IS NULL`, params: [] };
      }

      if (value === "true" || value === "false") {
        return { sql: `${target} = ?`, params: [value === "true" ? 1 : 0] };
      }

      throw new PostgrestGatewayError(
        400,
        "PGRST100",
        `invalid is value ${value}`
      );
    }

    case "in": {
      const items = parseInList(value);

      return items.length === 0
        ? { sql: "FALSE", params: [] }
        : {
            sql: `${target} IN (${items.map(() => "?").join(", ")})`,
            params: items.map((item) => mysqlFilterParameter(kind, item)),
          };
    }

    case "like": {
      return { sql: `${target} LIKE ?`, params: [likePattern(value)] };
    }

    case "ilike": {
      return {
        sql: `LOWER(${target}) LIKE LOWER(?)`,
        params: [likePattern(value)],
      };
    }

    case "cs": {
      // An array column holding every listed value: `cs.{a,b}`.
      const items =
        value.startsWith("{") && value.endsWith("}")
          ? parseInList(`(${value.slice(1, -1)})`)
          : [value];

      return {
        sql: `JSON_CONTAINS(${target}, ?)`,
        params: [JSON.stringify(items)],
      };
    }

    default: {
      throw new PostgrestGatewayError(
        400,
        "PGRST100",
        `unsupported filter ${operator} on ${column}`
      );
    }
  }
};

/**
 * One filter (`column=op.value`) as SQL.
 *
 * @param tableName - The table's name.
 * @param table - The table.
 * @param column - The filtered column.
 * @param filter - The filter, such as `eq.5` or `in.(a,b)`.
 * @returns The condition.
 */
export const parseFilter = (
  tableName: string,
  table: AgentTable,
  column: string,
  filter: string
): SqlCondition => {
  const kind = columnKind(tableName, table, column);
  const negated = filter.startsWith("not.");
  const body = negated ? filter.slice(4) : filter;
  const dot = body.indexOf(".");
  const operator = dot === -1 ? body : body.slice(0, dot);
  const value = dot === -1 ? "" : body.slice(dot + 1);
  const condition = filterCondition(column, kind, operator, value);

  return negated
    ? { sql: `NOT (${condition.sql})`, params: condition.params }
    : condition;
};

/**
 * An order parameter as SQL, with Postgres' null placement: nulls last when
 * ascending and first when descending, unless the order says.
 *
 * @param tableName - The table's name.
 * @param table - The table.
 * @param order - The order parameter, such as `created_at.desc,id.asc`.
 * @returns The ORDER BY list, or an empty string.
 */
export const parseOrder = (
  tableName: string,
  table: AgentTable,
  order: string | null
) => {
  if (order === null || order === "") {
    return "";
  }

  return order
    .split(",")
    .map((term) => {
      const [column = "", direction = "asc", nulls] = term.split(".");
      columnKind(tableName, table, column);
      const descending = direction === "desc";

      const nullsFirst =
        nulls === undefined ? descending : nulls === "nullsfirst";

      const target = quoteIdentifier(column);
      const nullsOrder = nullsFirst ? "DESC" : "ASC";
      const valueOrder = descending ? "DESC" : "ASC";

      return `(${target} IS NULL) ${nullsOrder}, ${target} ${valueOrder}`;
    })
    .join(", ");
};

// The query parameters that are not filters.
const reservedParameters = new Set([
  "select",
  "order",
  "limit",
  "offset",
  "on_conflict",
  "columns",
]);

/**
 * The rows of a table a user's request reaches (the template's row level
 * security, as conditions): the user's own and, on a table about one
 * business (AgentTable.business), the request's business's — its own
 * business_number, or its conversation's. None for the service scope.
 *
 * @param table - The table.
 * @param scope - Whose rows the request reaches.
 * @returns The conditions, to AND together.
 */
export const userScopeConditions = (
  table: AgentTable,
  scope: AgentGatewayScope
): SqlCondition[] => {
  if (scope.role !== "user" || table.owner === null) {
    return [];
  }

  const conditions: SqlCondition[] = [
    { sql: `${quoteIdentifier(table.owner)} = ?`, params: [scope.userId] },
  ];

  if (table.business === "column") {
    conditions.push({
      sql: "`business_number` <=> ?",
      params: [scope.businessNumber],
    });
  }

  if (table.business === "conversation") {
    conditions.push({
      sql: "`conversation_id` IN (SELECT `id` FROM `agent_chat_conversations` WHERE `user_id` = ? AND `business_number` <=> ?)",
      params: [scope.userId, scope.businessNumber],
    });
  }

  return conditions;
};

/**
 * Every filter of a request's URL as one WHERE condition (AND), after the
 * conditions of whose rows the request reaches (userScopeConditions).
 *
 * @param tableName - The table's name.
 * @param table - The table.
 * @param url - The request's URL.
 * @param scoped - The user's scope conditions; none for the service scope.
 * @returns The condition.
 */
export const parseWhere = (
  tableName: string,
  table: AgentTable,
  url: URL,
  scoped: readonly SqlCondition[]
): SqlCondition => {
  const conditions: SqlCondition[] = [...scoped];

  for (const [column, filter] of url.searchParams) {
    if (!reservedParameters.has(column)) {
      conditions.push(parseFilter(tableName, table, column, filter));
    }
  }

  return conditions.length === 0
    ? { sql: "TRUE", params: [] }
    : {
        sql: conditions.map((condition) => `(${condition.sql})`).join(" AND "),
        params: conditions.flatMap((condition) => condition.params),
      };
};

/**
 * A number parameter (limit, offset), or null when it is not given.
 *
 * @param url - The request's URL.
 * @param name - The parameter.
 * @returns The number.
 */
export const numberParameter = (url: URL, name: string) => {
  const text = url.searchParams.get(name);

  if (text === null) {
    return null;
  }

  const value = Number(text);

  if (!Number.isInteger(value) || value < 0) {
    throw new PostgrestGatewayError(400, "PGRST103", `invalid ${name} ${text}`);
  }

  return value;
};
