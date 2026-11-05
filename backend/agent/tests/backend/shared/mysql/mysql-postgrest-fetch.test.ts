import { assert, describe, it } from "@effect/vitest";

import {
  createServiceDatabaseClient,
  createUserDatabaseClient,
} from "../../../../backend/shared/mysql/mysql-agent-clients";
import type {
  AgentSqlDatabase,
  AgentSqlResult,
} from "../../../../backend/shared/mysql/mysql-agent-database";
import {
  mysqlTimestamp,
  postgresTimestamp,
} from "../../../../backend/shared/mysql/mysql-agent-values";
import { createMysqlPostgrestFetch } from "../../../../backend/shared/mysql/mysql-postgrest-fetch";

// The MySQL gateway's translation of supabase-js queries, with no database:
// a fake records each statement and answers with the rows a test gives. The
// gateway's behavior against a real MySQL is in
// mysql-agent-gateway.integration.test.ts.

interface RecordedStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
}

const fakeDatabase = (
  answer: (statement: RecordedStatement) => Partial<AgentSqlResult> = () => ({})
) => {
  const statements: RecordedStatement[] = [];

  const query = async (sql: string, params: readonly unknown[] = []) => {
    const statement = { sql: sql.replaceAll(/\s+/gu, " ").trim(), params };
    statements.push(statement);
    const result = answer(statement);

    return await Promise.resolve({
      rows: result.rows ?? [],
      affectedRows: result.affectedRows ?? 0,
    });
  };

  const database: AgentSqlDatabase = {
    query,
    transaction: async (work) => await work({ query }),
  };

  return { database, statements };
};

const userId = "11111111-1111-4111-8111-111111111111";
const chatId = "22222222-2222-4222-8222-222222222222";
const rowId = "33333333-3333-4333-8333-333333333333";
const streamId = "44444444-4444-4444-8444-444444444444";
const businessNumber = "514000001";

describe("mysql postgrest gateway", () => {
  it("scopes a user's read to their rows in the request's business and translates filters, order and paging", async () => {
    const { database, statements } = fakeDatabase(() => ({
      rows: [
        {
          id: chatId,
          name: "Plumbers",
          pinned: 1,
          created_at: "2026-10-22 13:30:51.235123",
        },
      ],
    }));

    const supabase = createUserDatabaseClient(database, userId, businessNumber);

    const { data, error } = await supabase
      .from("agent_chat_conversations")
      .select("id, name, pinned, created_at")
      .in("name", ["Plumbers", "b,c"])
      .is("answering_until", null)
      .order("created_at", { ascending: false })
      .range(10, 19);

    assert.isNull(error);
    assert.deepStrictEqual(data, [
      {
        id: chatId,
        name: "Plumbers",
        pinned: true,
        created_at: "2026-10-22T13:30:51.235123+00:00",
      },
    ]);

    const [read] = statements;
    assert.strictEqual(
      read?.sql,
      "SELECT `id` AS `id`, `name` AS `name`, `pinned` AS `pinned`, `created_at` AS `created_at` FROM `agent_chat_conversations` WHERE (`user_id` = ?) AND (`business_number` <=> ?) AND (`name` IN (?, ?)) AND (`answering_until` IS NULL) ORDER BY (`created_at` IS NULL) DESC, `created_at` DESC LIMIT 10 OFFSET 10"
    );
    assert.deepStrictEqual(read?.params, [
      userId,
      businessNumber,
      "Plumbers",
      "b,c",
    ]);
  });

  it("reaches a conversation's content only through a conversation in the request's business", async () => {
    const { database, statements } = fakeDatabase(() => ({ rows: [] }));

    const supabase = createUserDatabaseClient(database, userId, businessNumber);

    await supabase
      .from("agent_chat_messages")
      .select("id")
      .eq("conversation_id", chatId);

    assert.strictEqual(
      statements[0]?.sql,
      "SELECT `id` AS `id` FROM `agent_chat_messages` WHERE (`user_id` = ?) AND (`conversation_id` IN (SELECT `id` FROM `agent_chat_conversations` WHERE `user_id` = ? AND `business_number` <=> ?)) AND (`conversation_id` = ?)"
    );
    assert.deepStrictEqual(statements[0]?.params, [
      userId,
      userId,
      businessNumber,
      chatId,
    ]);

    // Memory belongs to the pair (actor, data owner), whatever the business.
    await supabase.from("agent_memories").select("id");
    assert.strictEqual(
      statements[1]?.sql,
      "SELECT `id` AS `id` FROM `agent_memories` WHERE (`user_id` = ?)"
    );
  });

  it("writes a new conversation in the request's business and never moves one to another", async () => {
    const { database, statements } = fakeDatabase();

    const supabase = createUserDatabaseClient(database, userId, businessNumber);

    const inserted = await supabase
      .from("agent_chat_conversations")
      .insert({ id: chatId, name: "x" });

    assert.isNull(inserted.error);
    const insert = statements.find(({ sql }) => sql.startsWith("INSERT"));
    assert.include(insert?.sql ?? "", "`business_number`");
    assert.include(insert?.params ?? [], businessNumber);

    const forged = await supabase
      .from("agent_chat_conversations")
      .insert({ id: rowId, name: "x", business_number: "999999999" });

    assert.strictEqual(forged.error?.code, "42501");

    const moved = await supabase
      .from("agent_chat_conversations")
      .update({ business_number: "999999999" })
      .eq("id", chatId);

    assert.strictEqual(moved.error?.code, "42501");
  });

  it("answers single() with one row, or PGRST116", async () => {
    const { database } = fakeDatabase(() => ({ rows: [] }));
    const supabase = createUserDatabaseClient(database, userId, null);

    const none = await supabase
      .from("agent_memories")
      .select("id")
      .eq("id", rowId)
      .single();

    assert.strictEqual(none.error?.code, "PGRST116");

    const maybe = await supabase
      .from("agent_memories")
      .select("id")
      .eq("id", rowId)
      .maybeSingle();

    assert.isNull(maybe.error);
    assert.isNull(maybe.data);
  });

  it("refuses a column the table does not have, without reaching SQL", async () => {
    const { database, statements } = fakeDatabase();

    const gatewayFetch = createMysqlPostgrestFetch(database, {
      role: "user",
      userId,
      businessNumber: null,
    });

    const response = await gatewayFetch(
      `https://gateway.test/rest/v1/agent_memories?select=id&${encodeURIComponent("content`; DROP TABLE x; --")}=eq.y`
    );

    const body = await response.text();

    assert.strictEqual(response.status, 400);
    assert.include(body, "42703");
    assert.strictEqual(statements.length, 0);
  });

  it("writes a user's new rows as theirs and refuses rows written as someone else", async () => {
    const { database, statements } = fakeDatabase(({ sql }) =>
      sql.startsWith("SELECT id FROM agent_chat_conversations")
        ? { rows: [{ id: chatId }] }
        : {}
    );

    const supabase = createUserDatabaseClient(database, userId, null);

    const inserted = await supabase.from("agent_chat_steers").insert({
      id: rowId,
      conversation_id: chatId,
      stream_id: streamId,
      text: "hi",
    });

    assert.isNull(inserted.error);

    const insert = statements.find(({ sql }) => sql.startsWith("INSERT"));
    assert.include(insert?.sql ?? "", "`user_id`");
    assert.include(insert?.params ?? [], userId);

    const forged = await supabase.from("agent_chat_steers").insert({
      id: "55555555-5555-4555-8555-555555555555",
      conversation_id: chatId,
      stream_id: streamId,
      text: "hi",
      user_id: "22222222-2222-4222-8222-222222222222",
    });

    assert.strictEqual(forged.error?.code, "42501");
  });

  it("refuses a row naming a conversation that is not the user's", async () => {
    const { database } = fakeDatabase(() => ({ rows: [] }));
    const supabase = createUserDatabaseClient(database, userId, null);

    const { error } = await supabase.from("agent_chat_messages").upsert({
      id: rowId,
      conversation_id: "66666666-6666-4666-8666-666666666666",
      role: "user",
      parts: [],
    });

    assert.strictEqual(error?.code, "42501");
  });

  it("keeps a user to the template's grants: only some columns, only some tables", async () => {
    const { database, statements } = fakeDatabase();
    const supabase = createUserDatabaseClient(database, userId, null);

    const score = await supabase
      .from("task_opportunities")
      .update({ score: 100 })
      .eq("id", rowId);

    assert.strictEqual(score.error?.code, "42501");

    const scanned = await supabase.from("task_scanned_items").select("*");
    assert.strictEqual(scanned.error?.code, "42501");

    const monitorOnly = await supabase.rpc("claim_due_tracking_tasks", {
      lease_seconds: 120,
      claim_limit: 1,
    });

    assert.strictEqual(monitorOnly.error?.code, "42501");
    assert.strictEqual(statements.length, 0);
  });

  it("gives the service client every user's rows, and no chat functions", async () => {
    const { database, statements } = fakeDatabase(() => ({ rows: [] }));
    const supabase = createServiceDatabaseClient(database);

    await supabase
      .from("user_settings")
      .select("seeking")
      .eq("user_id", userId);
    assert.strictEqual(
      statements[0]?.sql,
      "SELECT `seeking` AS `seeking` FROM `user_settings` WHERE (`user_id` = ?)"
    );

    const chat = await supabase.rpc("list_agent_chat_conversations");
    assert.strictEqual(chat.error?.code, "42501");
  });

  it("counts with count: exact, head: true", async () => {
    const { database, statements } = fakeDatabase(() => ({
      rows: [{ count: 7 }],
    }));

    const supabase = createUserDatabaseClient(database, userId, null);

    const { count, error } = await supabase
      .from("agent_memories")
      .select("id", { count: "exact", head: true });

    assert.isNull(error);
    assert.strictEqual(count, 7);
    assert.strictEqual(
      statements[0]?.sql,
      "SELECT COUNT(*) AS count FROM `agent_memories` WHERE (`user_id` = ?)"
    );
  });

  it("refuses text that is not a uuid for a uuid column, as Postgres does", async () => {
    const { database, statements } = fakeDatabase();
    const supabase = createUserDatabaseClient(database, userId, null);

    const { error } = await supabase
      .from("agent_memories")
      .select("id")
      .eq("id", "not-a-uuid");

    assert.strictEqual(error?.code, "22P02");
    assert.strictEqual(statements.length, 0);
  });

  it("converts times both ways without shifting them", () => {
    assert.strictEqual(
      mysqlTimestamp("2026-10-22T13:30:51.235123+00:00"),
      "2026-10-22 13:30:51.235123"
    );
    assert.strictEqual(
      mysqlTimestamp("2026-10-22T13:30:51.2Z"),
      "2026-10-22 13:30:51.200000"
    );
    assert.strictEqual(
      mysqlTimestamp("2026-10-22T16:30:51.000+03:00"),
      "2026-10-22 13:30:51.000"
    );
    assert.isNull(mysqlTimestamp("not a time"));
    assert.strictEqual(
      postgresTimestamp("2026-10-22 13:30:51.235123"),
      "2026-10-22T13:30:51.235123+00:00"
    );
  });
});
