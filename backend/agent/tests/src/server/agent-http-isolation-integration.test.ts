import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { afterAll, beforeAll } from "vitest";

import { writeStoredAgentChatMessages } from "@/agent/chat/messages/agent-chat-message-storage.server";
import { claimAgentChatAnswer } from "@/agent/chat/turn/agent-chat-answer-lease.server";
import { insertStoredAgentMemory } from "@/agent/memory/long-term-memory.server";
import type {
  disposeAppRuntime,
  handleAgentHttpRequest,
} from "@/server/agent-http.server";
import type { AgentRequestUser } from "@/server/runtime/agent-request-identity";

import { createUserDatabaseClient } from "../../../backend/shared/mysql/mysql-agent-clients";
import {
  createAgentMysqlPool,
  mysqlAgentSqlDatabase,
} from "../../../backend/shared/mysql/mysql-agent-database";
import type { AgentSqlDatabase } from "../../../backend/shared/mysql/mysql-agent-database";

// KeepInTax's isolation of the agent's data, through the HTTP entry the Nest
// backend calls, against a real MySQL with both agent migrations
// (2026-10-22_agent_harness_schema.sql, 2026-11-05_agent_actor_owner_scope.sql):
// the agent's user is the pair (actor, data owner), and a conversation
// covers any of that owner's businesses. One accountant's running answer
// about client A, started in business A1, continues from A's business A2,
// and is attacked, by its ids, from every other pair: the same accountant
// acting for client B and for themselves, and client A acting alone. A
// conversation id alone authorizes nothing. Needs AGENT_TEST_DATABASE_URL;
// skipped without it.

const databaseUrl = process.env.AGENT_TEST_DATABASE_URL;
const apiOrigin = "http://api.keepintax.test";
const appOrigin = "http://app.keepintax.test";

const run = async <A, E>(effect: Effect.Effect<A, E>) =>
  await Effect.runPromise(effect);

const decodeSession = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ userId: Schema.String }))
);

// The server functions' inputs these tests send, as the page sends them.
interface ServerFunctionInput {
  readonly userId: string;
  readonly conversationId?: string;
  readonly words?: string;
  readonly memoryId?: string;
  readonly change?: { readonly name: string };
}

const accountant = `accountant-${crypto.randomUUID()}`;
const clientA = `client-a-${crypto.randomUUID()}`;
const clientB = `client-b-${crypto.randomUUID()}`;

const scope = (
  actor: string,
  owner: string,
  businessNumber: string | null
): AgentRequestUser => ({
  actorFirebaseId: actor,
  firebaseId: owner,
  businessNumber,
  delegationScopes: actor === owner ? [] : ["DOCUMENTS_READ"],
  isDelegatedAccess: actor !== owner,
  isAdminImpersonation: false,
});

// The scope that owns the running answer.
const forClientAInA1 = scope(accountant, clientA, "500000001");
const forClientAInA2 = scope(accountant, clientA, "500000002");
const forClientB = scope(accountant, clientB, "500000003");
const forThemselves = scope(accountant, accountant, null);
const clientAAlone = scope(clientA, clientA, "500000001");

// Every other pair, each of which must reach none of the conversation or
// the pair's memory.
const others: [string, AgentRequestUser][] = [
  ["the accountant acting for client B", forClientB],
  ["the accountant acting for themselves", forThemselves],
  ["client A acting alone, in the same business", clientAAlone],
];

describe.skipIf(databaseUrl === undefined)(
  "agent isolation by actor, data owner and business",
  () => {
    let http: {
      handleAgentHttpRequest: typeof handleAgentHttpRequest;
      disposeAppRuntime: typeof disposeAppRuntime;
    };

    let pool: ReturnType<typeof createAgentMysqlPool>;
    let database: AgentSqlDatabase;

    const call = async (
      user: AgentRequestUser,
      path: string,
      init: RequestInit = {}
    ) => {
      const headers = new Headers(init.headers);
      headers.set("origin", appOrigin);

      return await http.handleAgentHttpRequest(
        new Request(`${apiOrigin}${path}`, { ...init, headers }),
        user
      );
    };

    const session = async (user: AgentRequestUser) => {
      const response = await call(user, "/api/agent/fn/readAgentSession");
      assert.strictEqual(response.status, 200);
      const { userId } = decodeSession(await response.text());

      return userId;
    };

    const read = async (
      user: AgentRequestUser,
      name: string,
      data: ServerFunctionInput
    ) =>
      await call(
        user,
        `/api/agent/fn/${name}?data=${encodeURIComponent(JSON.stringify(data))}`
      );

    const post = async (
      user: AgentRequestUser,
      name: string,
      data: ServerFunctionInput
    ) =>
      await call(user, `/api/agent/fn/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });

    const readText = async (
      user: AgentRequestUser,
      name: string,
      data: ServerFunctionInput
    ) => {
      const response = await read(user, name, data);

      return await response.text();
    };

    // Client A's running answer, as the accountant left it: a conversation
    // in business A1 with messages, a held lease and an active stream, and
    // a memory the agent saved in it.
    let ownerId = "";
    let memoryId = "";
    const conversationId = crypto.randomUUID();
    const secret = `Client A paid ${crypto.randomUUID()} for fuel`;

    const conversationRow = async () => {
      const { rows } = await database.query(
        "SELECT active_stream_id, name FROM agent_chat_conversations WHERE id = ?",
        [conversationId]
      );

      return rows[0];
    };

    beforeAll(async () => {
      const url = new URL(databaseUrl ?? "mysql://localhost/agent_test");
      process.env.AGENT_DB_HOST = url.hostname;
      process.env.AGENT_DB_PORT = url.port || "3306";
      process.env.AGENT_DB_USERNAME = decodeURIComponent(url.username);
      process.env.AGENT_DB_PASSWORD = decodeURIComponent(url.password);
      process.env.AGENT_DB_DATABASE = url.pathname.slice(1);
      process.env.AGENT_APP_ORIGINS = appOrigin;
      delete process.env.OPENAI_API_KEY;
      delete process.env.TYPESAFE_API_KEY;
      http = await import("@/server/agent-http.server");

      pool = createAgentMysqlPool({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password:
          url.password === "" ? undefined : decodeURIComponent(url.password),
        database: url.pathname.slice(1),
      });
      database = mysqlAgentSqlDatabase(pool);

      ownerId = await session(forClientAInA1);

      const owner = createUserDatabaseClient(
        database,
        ownerId,
        forClientAInA1.businessNumber
      );

      const lease = await run(
        claimAgentChatAnswer(owner, {
          conversationId,
          name: "Client A fuel",
          pinned: false,
          streamId: crypto.randomUUID(),
        })
      );

      assert.notStrictEqual(lease, "busy");
      assert.notStrictEqual(lease, "missing");

      await run(
        writeStoredAgentChatMessages(owner, conversationId, [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: secret }],
            metadata: { createdAt: new Date().toISOString() },
          },
        ])
      );

      memoryId = await run(
        insertStoredAgentMemory(owner, secret, conversationId)
      );
    });

    afterAll(async () => {
      await http?.disposeAppRuntime();
      await pool?.end();
    });

    it("gives each (actor, data owner) pair its own agent user, the same on every request", async () => {
      const [again, inA2, forB, themselves, alone] = await Promise.all(
        [
          forClientAInA1,
          forClientAInA2,
          forClientB,
          forThemselves,
          clientAAlone,
        ].map(session)
      );

      assert.strictEqual(again, ownerId);
      // The accountant for client A is one agent user in both of A's
      // businesses; every other pair is its own.
      assert.strictEqual(inA2, ownerId);
      assert.strictEqual(new Set([ownerId, forB, themselves, alone]).size, 4);
    });

    it("the owner reaches the conversation, its messages and its memory", async () => {
      const list = await readText(
        forClientAInA1,
        "listAgentChatConversations",
        { userId: ownerId }
      );

      assert.include(list, conversationId);

      const messages = await readText(
        forClientAInA1,
        "readAgentChatConversationMessages",
        { userId: ownerId, conversationId }
      );

      assert.include(messages, secret);

      const memories = await readText(forClientAInA1, "readAgentMemories", {
        userId: ownerId,
      });

      assert.include(memories, memoryId);

      const steer = await call(
        forClientAInA1,
        `/api/agent/chats/${conversationId}/steer`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            text: "only diesel",
          }),
        }
      );

      assert.strictEqual(steer.status, 204);
    });

    it.each(others)(
      "%s reaches none of the conversation, even with its ids",
      async (_who, user) => {
        const userId = await session(user);

        // The page's agent user from before a switch is refused: switching
        // client means reading the session again.
        assert.notStrictEqual(userId, ownerId);

        const stale = await read(user, "listAgentChatConversations", {
          userId: ownerId,
        });

        assert.strictEqual(stale.status, 401);
        await stale.text();

        const list = await readText(user, "listAgentChatConversations", {
          userId,
        });

        assert.notInclude(list, conversationId);

        const search = await readText(user, "searchAgentChatConversations", {
          userId,
          words: "fuel",
        });

        assert.notInclude(search, conversationId);

        const messages = await readText(
          user,
          "readAgentChatConversationMessages",
          { userId, conversationId }
        );

        assert.notInclude(messages, secret);

        // The running answer: not followed, not stopped, not steered.
        const stream = await call(
          user,
          `/api/agent/chats/${conversationId}/stream`
        );

        assert.strictEqual(stream.status, 204);

        const stop = await call(
          user,
          `/api/agent/chats/${conversationId}/stop`,
          { method: "POST" }
        );

        assert.strictEqual(stop.status, 204);

        const afterStop = await conversationRow();
        assert.isNotNull(
          afterStop?.active_stream_id,
          "the owner's answer is still running"
        );

        const steer = await call(
          user,
          `/api/agent/chats/${conversationId}/steer`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: crypto.randomUUID(), text: "hijack" }),
          }
        );

        assert.strictEqual(steer.status, 409);
        assert.include(await steer.text(), "AGENT_CHAT_NOT_ANSWERING");

        // Continuing the conversation by its id.
        const chat = await call(user, "/api/agent/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId,
            id: conversationId,
            message: {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: "and what else?" }],
            },
            conversation: { name: null, pinned: false },
            locale: "en",
          }),
        });

        assert.strictEqual(chat.status, 404);
        assert.include(await chat.text(), "AGENT_CHAT_NOT_FOUND");

        // Renaming or deleting it by its id changes nothing.
        const rename = await post(user, "changeAgentChatConversation", {
          userId,
          conversationId,
          change: { name: "taken" },
        });

        await rename.text();

        const remove = await post(user, "deleteAgentChatConversation", {
          userId,
          conversationId,
        });

        await remove.text();

        const afterChanges = await conversationRow();
        assert.strictEqual(afterChanges?.name, "Client A fuel");

        // Memory belongs to the pair: no one else sees it, and no one else
        // can forget it.
        const memories = await readText(user, "readAgentMemories", { userId });
        assert.notInclude(memories, memoryId);

        const forget = await post(user, "deleteAgentMemory", {
          userId,
          memoryId,
        });

        await forget.text();

        const kept = await readText(forClientAInA1, "readAgentMemories", {
          userId: ownerId,
        });

        assert.include(kept, memoryId);
      }
    );

    it("the same accountant for client A in another business continues the conversation", async () => {
      // Switching the active business keeps the agent user, the history,
      // the memory and the running answer.
      const userId = await session(forClientAInA2);
      assert.strictEqual(userId, ownerId);

      const list = await readText(
        forClientAInA2,
        "listAgentChatConversations",
        {
          userId,
        }
      );

      assert.include(list, conversationId);

      const messages = await readText(
        forClientAInA2,
        "readAgentChatConversationMessages",
        { userId, conversationId }
      );

      assert.include(messages, secret);

      const memories = await readText(forClientAInA2, "readAgentMemories", {
        userId,
      });

      assert.include(memories, memoryId);

      const steer = await call(
        forClientAInA2,
        `/api/agent/chats/${conversationId}/steer`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            text: "and in the second business?",
          }),
        }
      );

      assert.strictEqual(steer.status, 204);
    });

    it("never serves agent data from before the pairing (its owner is unknown)", async () => {
      // A legacy agent user, as 2026-10-22's schema stored it: the
      // accountant's uid with no data owner, and a conversation under it.
      const legacyUserId = crypto.randomUUID();
      const legacyConversationId = crypto.randomUUID();

      await database.query(
        "INSERT INTO agent_users (id, firebase_id, data_owner_firebase_id) VALUES (?, ?, NULL)",
        [legacyUserId, accountant]
      );
      await database.query(
        "INSERT INTO agent_chat_conversations (id, user_id, name) VALUES (?, ?, 'legacy')",
        [legacyConversationId, legacyUserId]
      );

      const lists = await Promise.all(
        [forThemselves, forClientAInA1, forClientB].map(async (user) => {
          const userId = await session(user);
          assert.notStrictEqual(userId, legacyUserId);

          return await readText(user, "listAgentChatConversations", {
            userId,
          });
        })
      );

      for (const list of lists) {
        assert.notInclude(list, legacyConversationId);
      }

      // Kept, not deleted or reassigned.
      const { rows } = await database.query(
        "SELECT user_id FROM agent_chat_conversations WHERE id = ?",
        [legacyConversationId]
      );

      assert.strictEqual(rows[0]?.user_id, legacyUserId);
    });
  }
);
