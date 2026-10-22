import { createClient } from "@supabase/supabase-js";
import { Option, Predicate, Schema } from "effect";

import type { Database } from "@/lib/supabase/supabase-database";

import {
  fakeFetchBodyText,
  fakeFetchUrl,
  fakeJsonText,
} from "../../../backend/shared/fixtures/fake-fetch-request";
import type {
  AgentEvalData,
  AgentEvalRow,
  AgentEvalWrite,
} from "./agent-eval-fixtures";
import { evalUserId } from "./agent-eval-fixtures";

// An in-memory stand-in of the user's database for the agent evals: a real
// supabase-js client whose fetch answers from the case's fixtures and records
// every write.

// A stored record's text (a jsonb snapshot column), for the word filter.
const evalPostText = Schema.decodeUnknownOption(
  Schema.Struct({ text: Schema.NullOr(Schema.String) })
);

// The filters the agent tools use: equality, membership, a date's lower bound
// (gte), and stored records' words (or=(snapshot->>text.ilike."*word*",…)).
const readEvalRows = (rows: AgentEvalRow[], url: URL) =>
  rows.filter((row) =>
    [...url.searchParams.entries()].every(([column, filter]) => {
      if (filter.startsWith("eq.")) {
        return (
          !(column in row) || fakeJsonText(row[column]) === filter.slice(3)
        );
      }

      if (filter.startsWith("in.(")) {
        return filter
          .slice(4, -1)
          .split(",")
          .map((value) => value.replaceAll('"', ""))
          .includes(fakeJsonText(row[column]));
      }

      // A number column (score) compares as a number; Date.parse would read
      // 88 and 0 as the years 1988 and 2000.
      if (filter.startsWith("gte.")) {
        const value = row[column];

        if (Predicate.isNumber(value)) {
          return value >= Number(filter.slice(4));
        }

        return (
          column in row &&
          value !== null &&
          Date.parse(fakeJsonText(value)) >= Date.parse(filter.slice(4))
        );
      }

      if (column === "or") {
        const words = [
          ...filter.matchAll(/ilike\."\*(?<word>[^*]+)\*"/gu),
        ].flatMap((match) => {
          const word = match.groups?.word ?? "";

          return word === "" ? [] : [word];
        });

        // Another or (the chat's answering lease: is null or past) is not
        // read; the stand-in has one answer at a time anyway.
        if (words.length === 0) {
          return true;
        }

        const text = Option.match(evalPostText(row.snapshot), {
          onNone: () => "",
          onSome: (snapshot) => snapshot.text ?? "",
        });

        return words.some((word) => text.includes(word));
      }

      return true;
    })
  );

// Embedded counts a select asks for, as PostgREST answers them: a folder's
// ad_folder_items(count) is [{ count }] of its items. Each child table's key
// to its parent is named here.
const evalEmbeddedCountKeys = new Map([
  ["ad_folders/ad_folder_items", "folder_id"],
]);

const withEvalEmbeddedCounts = (
  tables: Map<string, AgentEvalRow[]>,
  resource: string,
  url: URL,
  row: AgentEvalRow
): AgentEvalRow => {
  const select = url.searchParams.get("select") ?? "";

  const counts = select.split(",").flatMap((column) => {
    const child = column.trim().replace("(count)", "");
    const key = evalEmbeddedCountKeys.get(`${resource}/${child}`);

    return key === undefined || !column.trim().endsWith("(count)")
      ? []
      : [
          [
            child,
            [
              {
                count: (tables.get(child) ?? []).filter(
                  (item) => item[key] === row.id
                ).length,
              },
            ],
          ] as const,
        ];
  });

  return counts.length === 0 ? row : { ...row, ...Object.fromEntries(counts) };
};

// Newest first by the first order column, as the stored posts search asks.
const orderEvalRows = (rows: AgentEvalRow[], url: URL) => {
  const [column, direction] = (url.searchParams.get("order") ?? "")
    .split(",")[0]
    ?.split(".") ?? [""];

  if (!column) {
    return rows;
  }

  const value = (row: AgentEvalRow) => fakeJsonText(row[column] ?? "");

  return rows.toSorted((first, second) =>
    direction === "desc"
      ? value(second).localeCompare(value(first))
      : value(first).localeCompare(value(second))
  );
};

const evalJsonRow = Schema.Record(Schema.String, Schema.Json);

// A write's rows: a list, or one row (Array.isArray alone narrows to any[]).
const decodeEvalWriteBody = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Json)
);

const isEvalRowList = (
  sent: readonly AgentEvalRow[] | AgentEvalRow
): sent is readonly AgentEvalRow[] => Array.isArray(sent);

const writeActions = new Map<string, AgentEvalWrite["action"]>([
  ["POST", "insert"],
  ["PATCH", "update"],
  ["DELETE", "delete"],
]);

// Writes affect subsequent reads and turns, including missing-row outcomes.
const applyEvalWrite = (
  tables: Map<string, AgentEvalRow[]>,
  resource: string,
  action: AgentEvalWrite["action"],
  url: URL,
  body: string
): AgentEvalRow[] => {
  const rows = tables.get(resource) ?? [];
  const matched = readEvalRows(rows, url);

  if (action === "delete") {
    tables.set(
      resource,
      rows.filter((row) => !matched.includes(row))
    );

    return matched;
  }

  const sent = Schema.decodeUnknownSync(
    Schema.Union([Schema.Array(evalJsonRow), evalJsonRow])
  )(decodeEvalWriteBody(body));

  if (action === "update") {
    const columns = Schema.decodeUnknownSync(evalJsonRow)(sent);
    const updated = matched.map((row) => ({ ...row, ...columns }));
    tables.set(
      resource,
      rows.map((row) => updated[matched.indexOf(row)] ?? row)
    );

    return updated;
  }

  const inserted: AgentEvalRow[] = (isEvalRowList(sent) ? sent : [sent]).map(
    (row) => ({
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...row,
      id: row.id ?? crypto.randomUUID(),
      user_id: evalUserId,
    })
  );

  // A table whose rows the database fills in (defaults, joins) gets them
  // here, so a later read sees what the real database would return.
  tables.set(resource, [...rows, ...inserted]);

  return inserted;
};

/**
 * The user's database as supabase-js reaches it: reads answer from the
 * fixtures; writes are recorded and update those fixtures. The
 * chat's own server functions (titles, summaries) take it as their client.
 *
 * @param data - The case's rows, by table.
 * @param writes - Where each write is recorded.
 * @returns A Supabase client on the fixtures.
 */
export const createAgentEvalDatabase = (
  data: AgentEvalData,
  writes: AgentEvalWrite[]
) => {
  const tables = new Map<string, AgentEvalRow[]>(Object.entries(data));

  return createClient<Database>("https://agent-eval.supabase.co", "eval-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (request, options) => {
        const url = new URL(fakeFetchUrl(request));
        const method = options?.method ?? "GET";
        const body = fakeFetchBodyText(options?.body);
        // /rest/v1/<table>, or /rest/v1/rpc/<function>
        const segments = url.pathname.split("/").filter(Boolean);
        const resource = segments.at(2) ?? "";

        const wantsObject = new Headers(options?.headers)
          .get("Accept")
          ?.includes("vnd.pgrst.object");

        if (resource === "rpc") {
          writes.push({ table: segments.at(3) ?? "", action: "rpc", body });

          // An answer's claim (claim_agent_chat_answer) always gets the
          // lease: each case is one answer at a time.
          if (segments.at(3) === "claim_agent_chat_answer") {
            return await Promise.resolve(
              Response.json([
                {
                  status: "claimed",
                  answering_until: new Date(Date.now() + 300_000).toISOString(),
                },
              ])
            );
          }

          return await Promise.resolve(Response.json(null));
        }

        const action = writeActions.get(method);

        if (!action) {
          const filtered = orderEvalRows(
            readEvalRows(tables.get(resource) ?? [], url),
            url
          );

          const offset = Number(url.searchParams.get("offset") ?? 0);

          const limit = Number(
            url.searchParams.get("limit") ?? filtered.length
          );

          const rows = filtered
            .slice(offset, offset + limit)
            .map((row) => withEvalEmbeddedCounts(tables, resource, url, row));

          if (method === "HEAD") {
            return await Promise.resolve(
              new Response(null, {
                headers: { "Content-Range": `*/${rows.length}` },
              })
            );
          }

          // The count a select with count: "exact" reads, as PostgREST
          // sends it.
          if (wantsObject !== true) {
            return await Promise.resolve(
              Response.json(rows, {
                headers: {
                  "Content-Range": `${offset}-${offset + rows.length - 1}/${filtered.length}`,
                },
              })
            );
          }

          return await Promise.resolve(
            rows.length > 0
              ? Response.json(rows[0])
              : Response.json(
                  { code: "PGRST116", message: "no rows" },
                  { status: 406 }
                )
          );
        }

        writes.push({ table: resource, action, body });
        const echoed = applyEvalWrite(tables, resource, action, url, body);

        return await Promise.resolve(
          Response.json(wantsObject === true ? echoed[0] : echoed)
        );
      },
    },
  });
};
