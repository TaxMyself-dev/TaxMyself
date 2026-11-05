import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { afterAll, beforeAll } from "vitest";

import {
  readStoredAgentChatConversations,
  searchStoredAgentChatConversations,
  updateAgentChatConversationRow,
} from "@/agent/chat/conversations/agent-chat-conversations.server";
import {
  readStoredAgentChatMessages,
  writeStoredAgentChatMessages,
} from "@/agent/chat/messages/agent-chat-message-storage.server";
import {
  claimAgentChatAnswer,
  releaseAgentChatAnswer,
  renewAgentChatAnswer,
} from "@/agent/chat/turn/agent-chat-answer-lease.server";
import {
  addAgentChatUserSteer,
  createAgentChatUserSteers,
} from "@/agent/chat/turn/agent-chat-user-steers.server";
import { recordAgentUsage } from "@/agent/core/model/agent-usage.server";
import {
  deleteStoredAgentMemories,
  insertStoredAgentMemory,
  readStoredAgentMemories,
  updateStoredAgentMemory,
} from "@/agent/memory/long-term-memory.server";
import { newTrackingTask } from "@/lib/tasks/tracking-task-schema";
import {
  changeStoredTaskOpportunityStatus,
  readStoredTaskOpportunities,
} from "@/server/tasks/task-opportunity-storage.server";
import {
  deleteStoredTrackingTasks,
  insertStoredTrackingTask,
  readStoredTrackingTasks,
  updateStoredTrackingTask,
} from "@/server/tasks/tracking-task-storage.server";
import {
  readStoredUserSettings,
  updateStoredUserSettings,
} from "@/server/user-data/user-settings-storage.server";

import { TaskMonitorStore } from "../../../../backend/monitor/scan/task-monitor-store";
import {
  createServiceDatabaseClient,
  createUserDatabaseClient,
  resolveAgentUserId,
} from "../../../../backend/shared/mysql/mysql-agent-clients";
import {
  createAgentMysqlPool,
  mysqlAgentSqlDatabase,
} from "../../../../backend/shared/mysql/mysql-agent-database";
import type { AgentSqlDatabase } from "../../../../backend/shared/mysql/mysql-agent-database";
import { SupabaseServiceDatabase } from "../../../../backend/shared/supabase/supabase-service-database";

// The template's own storage code against a real MySQL 8 through the gateway
// (backend/shared/mysql): the chat's lease, messages, steers, memory, usage,
// settings, tasks and opportunities, the monitor's claims and scan records,
// and the row level security the gateway keeps between two users. It needs
// a database with the agent's tables
// (backend/scripts/migrations/2026-10-22_agent_harness_schema.sql, then
// 2026-11-05_agent_actor_owner_scope.sql), named by
// AGENT_TEST_DATABASE_URL (mysql://root@127.0.0.1:3307/agent_test); without
// it the suite is skipped. Every run uses new users, so runs never collide.

const databaseUrl = process.env.AGENT_TEST_DATABASE_URL;

const run = async <A, E>(effect: Effect.Effect<A, E>) =>
  await Effect.runPromise(effect);

const message = (id: string, role: "user" | "assistant", text: string) => ({
  id,
  role,
  parts: [{ type: "text" as const, text }],
  metadata: { createdAt: new Date().toISOString() },
});

describe.skipIf(databaseUrl === undefined)("agent MySQL gateway", () => {
  let pool: ReturnType<typeof createAgentMysqlPool>;
  let database: AgentSqlDatabase;
  let alice: ReturnType<typeof createUserDatabaseClient>;
  let bob: ReturnType<typeof createUserDatabaseClient>;
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl ?? "mysql://localhost/agent_test");
    pool = createAgentMysqlPool({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password:
        url.password === "" ? undefined : decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    });
    database = mysqlAgentSqlDatabase(pool);
    // Two people, each acting on their own data (actor = data owner).
    const aliceUid = `alice-${crypto.randomUUID()}`;
    const bobUid = `bob-${crypto.randomUUID()}`;
    aliceId = await resolveAgentUserId(database, aliceUid, aliceUid);
    bobId = await resolveAgentUserId(database, bobUid, bobUid);
    alice = createUserDatabaseClient(database, aliceId, null);
    bob = createUserDatabaseClient(database, bobId, null);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("maps an (actor, data owner) pair to one agent user, with settings from the start", async () => {
    const firebaseId = `uid-${crypto.randomUUID()}`;
    const client = `client-${crypto.randomUUID()}`;
    const first = await resolveAgentUserId(database, firebaseId, firebaseId);
    const again = await resolveAgentUserId(database, firebaseId, firebaseId);
    assert.strictEqual(first, again);

    // Acting for a client is another agent user, also stable.
    const forClient = await resolveAgentUserId(database, firebaseId, client);
    assert.notStrictEqual(forClient, first);
    assert.strictEqual(
      await resolveAgentUserId(database, firebaseId, client),
      forClient
    );

    const settings = await run(
      readStoredUserSettings(
        createUserDatabaseClient(database, first, null),
        first
      )
    );

    assert.strictEqual(settings.profile.kind, "individual");
    assert.deepStrictEqual([...settings.profile.languages], ["en"]);
  });

  it("saves settings and reads them back", async () => {
    await run(
      updateStoredUserSettings(alice, aliceId, [
        { field: "seeking", value: "a bookkeeper in Haifa" },
        { field: "languages", value: ["he", "en"] },
      ])
    );
    const settings = await run(readStoredUserSettings(alice, aliceId));
    assert.strictEqual(settings.preferences.seeking, "a bookkeeper in Haifa");
    assert.deepStrictEqual([...settings.profile.languages], ["he", "en"]);
  });

  it("takes one answer lease per chat, renews it by its exact expiry, and hides it from others", async () => {
    const conversationId = crypto.randomUUID();

    const answer = {
      conversationId,
      name: null,
      pinned: false,
      streamId: crypto.randomUUID(),
    };

    const lease = await run(claimAgentChatAnswer(alice, answer));
    assert.notStrictEqual(lease, "busy");
    assert.notStrictEqual(lease, "missing");

    const second = await run(
      claimAgentChatAnswer(alice, { ...answer, streamId: crypto.randomUUID() })
    );

    assert.strictEqual(second, "busy");

    const stranger = await run(claimAgentChatAnswer(bob, answer));
    assert.strictEqual(stranger, "missing");

    if (lease === "busy" || lease === "missing") {
      throw new TypeError("the lease was not claimed");
    }

    assert.isTrue(await run(renewAgentChatAnswer(alice, lease)));
    await run(releaseAgentChatAnswer(alice, lease));

    const after = await run(
      claimAgentChatAnswer(alice, { ...answer, streamId: crypto.randomUUID() })
    );

    assert.notStrictEqual(after, "busy");
  });

  it("stores messages, lists and searches chats, and keeps them to their owner", async () => {
    const conversationId = crypto.randomUUID();
    await run(
      claimAgentChatAnswer(alice, {
        conversationId,
        name: null,
        pinned: false,
        streamId: crypto.randomUUID(),
      })
    );

    const userMessageId = crypto.randomUUID();
    await run(
      writeStoredAgentChatMessages(alice, conversationId, [
        message(userMessageId, "user", "Find me a plumber in Haifa"),
        message(crypto.randomUUID(), "assistant", "Here are three."),
      ])
    );

    const stored = await run(
      readStoredAgentChatMessages(alice, conversationId)
    );

    assert.strictEqual(stored.length, 2);

    const theirs = await run(readStoredAgentChatMessages(bob, conversationId));
    assert.strictEqual(theirs.length, 0);

    // Bob cannot take over Alice's message by sending its id.
    const takeover = await Effect.runPromiseExit(
      writeStoredAgentChatMessages(bob, conversationId, [
        message(userMessageId, "user", "overwritten"),
      ])
    );

    assert.strictEqual(takeover._tag, "Failure");

    const chats = await run(readStoredAgentChatConversations(alice));
    const chat = chats.find((item) => item.id === conversationId);
    assert.strictEqual(chat?.firstText, "Find me a plumber in Haifa");
    assert.isTrue(chat?.hasMessages);
    const bobsChats = await run(readStoredAgentChatConversations(bob));
    assert.isFalse(bobsChats.some((item) => item.id === conversationId));

    await run(
      updateAgentChatConversationRow(alice, conversationId, {
        name: "Plumbers",
        pinned: true,
      })
    );

    const afterRename = await run(readStoredAgentChatConversations(alice));
    const renamed = afterRename.find((item) => item.id === conversationId);

    assert.strictEqual(renamed?.name, "Plumbers");
    assert.isTrue(renamed?.pinned);

    const found = await run(
      searchStoredAgentChatConversations(alice, "PLUMBER")
    );

    assert.include(found, conversationId);
    assert.notInclude(
      await run(searchStoredAgentChatConversations(bob, "plumber")),
      conversationId
    );
  });

  it("queues steers under the running answer and hands them over once", async () => {
    const conversationId = crypto.randomUUID();
    const streamId = crypto.randomUUID();
    await run(
      claimAgentChatAnswer(alice, {
        conversationId,
        name: null,
        pinned: false,
        streamId,
      })
    );

    const added = await run(
      addAgentChatUserSteer(alice, conversationId, {
        id: crypto.randomUUID(),
        text: "only in Haifa",
      })
    );

    assert.strictEqual(added, "added");

    const notTheirs = await Effect.runPromiseExit(
      addAgentChatUserSteer(bob, conversationId, {
        id: crypto.randomUUID(),
        text: "hijack",
      })
    );

    assert.isTrue(
      notTheirs._tag === "Failure" ||
        (notTheirs._tag === "Success" && notTheirs.value === "not-answering")
    );

    const steers = createAgentChatUserSteers(alice, conversationId, streamId);
    const taken = await steers.take(0);
    assert.strictEqual(taken.length, 1);
    const again = await steers.take(0);
    assert.strictEqual(again.length, 0);
  });

  it("remembers, updates and forgets, and counts usage", async () => {
    const conversationId = crypto.randomUUID();
    await run(
      claimAgentChatAnswer(alice, {
        conversationId,
        name: null,
        pinned: false,
        streamId: crypto.randomUUID(),
      })
    );

    // A memory names the conversation it came up in, which must be the
    // user's own.
    const planted = await Effect.runPromiseExit(
      insertStoredAgentMemory(bob, "planted", conversationId)
    );

    assert.strictEqual(planted._tag, "Failure");

    const id = await run(
      insertStoredAgentMemory(alice, "Prefers short answers", conversationId)
    );

    await run(updateStoredAgentMemory(alice, id, "Prefers very short answers"));
    const memories = await run(readStoredAgentMemories(alice));
    assert.strictEqual(
      memories.find((memory) => memory.id === id)?.content,
      "Prefers very short answers"
    );
    const bobsMemories = await run(readStoredAgentMemories(bob));
    assert.strictEqual(bobsMemories.length, 0);

    const missing = await Effect.runPromiseExit(
      updateStoredAgentMemory(bob, id, "not mine")
    );

    assert.strictEqual(missing._tag, "Failure");

    assert.strictEqual(await run(deleteStoredAgentMemories(alice, [id])), 1);

    await run(recordAgentUsage(alice, conversationId, "answer", []));
  });

  it("keeps tasks versioned and opportunities to their status grant, and the monitor claims, records and finishes a scan", async () => {
    const task = newTrackingTask("apartments to rent in Haifa", {
      scanFrequency: "hour",
    });

    await run(insertStoredTrackingTask(alice, task, 0));
    const alicesTasks = await run(readStoredTrackingTasks(alice));
    assert.strictEqual(
      alicesTasks.filter((item) => item.id === task.id).length,
      1
    );
    const bobsTasks = await run(readStoredTrackingTasks(bob));
    assert.isFalse(bobsTasks.some((item) => item.id === task.id));

    await run(
      updateStoredTrackingTask(alice, { ...task, details: "two rooms" })
    );

    const stale = await Effect.runPromiseExit(
      updateStoredTrackingTask(alice, { ...task, details: "stale" })
    );

    assert.strictEqual(stale._tag, "Failure");

    // The monitor, with the service client.
    const serviceLayer = Layer.succeed(SupabaseServiceDatabase, {
      client: Effect.succeed(createServiceDatabaseClient(database)),
    });

    const monitor = await Effect.runPromise(
      Effect.gen(function* readTaskMonitorStore() {
        return yield* TaskMonitorStore;
      }).pipe(
        Effect.provide(
          TaskMonitorStore.layerNoDeps.pipe(Layer.provide(serviceLayer))
        )
      )
    );

    const claimed = await run(monitor.claimDueTasks(120, 100));
    const mine = claimed.find((item) => item.id === task.id);
    assert.isDefined(mine);

    if (mine === undefined) {
      return;
    }

    // A second worker skips it while the claim holds.
    const claimedAgain = await run(monitor.claimDueTasks(120, 100));
    assert.isFalse(claimedAgain.some((item) => item.id === task.id));

    await run(monitor.renewTaskScanClaim(mine, 120));

    const service = createServiceDatabaseClient(database);

    const recorded = await service.rpc("record_task_source_scan", {
      scan_run_id: mine.run_id,
      items: [
        {
          source: "web",
          itemId: "post-1",
          snapshot: {
            source: "web",
            id: "post-1",
            title: "Two rooms in Haifa",
            subtitle: null,
            text: "2 rooms",
            price: 4200,
            place: "Haifa",
            photoUrl: null,
            url: "https://example.com/post-1",
            postedAt: null,
            authorId: null,
            comments: [],
          },
        },
      ],
      scores: [{ source: "web", itemId: "post-1", score: 85, jevAnswers: {} }],
      opportunities: [
        {
          source: "web",
          itemId: "post-1",
          commentId: "",
          score: 85,
          intent: "Wants a tenant",
          reason: "Two rooms in Haifa",
          postedAt: null,
        },
      ],
    });

    assert.isNull(recorded.error);
    assert.strictEqual(recorded.data, 1);

    await run(monitor.finishTaskScan(mine, null));

    const lost = await service.rpc("record_task_source_scan", {
      scan_run_id: mine.run_id,
      items: [],
      scores: [],
      opportunities: [],
    });

    assert.include(lost.error?.message ?? "", "TASK_MONITOR_CLAIM_LOST");

    const { opportunities } = await run(
      readStoredTaskOpportunities(alice, {
        taskId: task.id,
        statuses: ["new"],
        minScore: 0,
        page: 0,
      })
    );

    assert.strictEqual(opportunities.length, 1);
    const [opportunity] = opportunities;
    assert.strictEqual(
      opportunity?.taskSentence,
      "apartments to rent in Haifa"
    );
    assert.strictEqual(opportunity?.item.title, "Two rooms in Haifa");

    if (opportunity === undefined) {
      return;
    }

    assert.strictEqual(
      await run(
        changeStoredTaskOpportunityStatus(alice, [opportunity.id], "replied")
      ),
      1
    );
    assert.strictEqual(
      await run(
        changeStoredTaskOpportunityStatus(bob, [opportunity.id], "closed")
      ),
      0
    );

    // A user may change only an opportunity's status (the template's
    // column grant).
    const scoreChange = await alice
      .from("task_opportunities")
      .update({ score: 100 })
      .eq("id", opportunity.id);

    assert.strictEqual(scoreChange.error?.code, "42501");

    // And may not write the monitor's tables.
    const forged = await alice.from("task_items").insert({
      user_id: aliceId,
      source: "web",
      item_id: "forged",
      snapshot: {},
    });

    assert.strictEqual(forged.error?.code, "42501");

    assert.strictEqual(
      await run(deleteStoredTrackingTasks(alice, [task.id])),
      1
    );
  });

  it("refuses rows written as another user", async () => {
    const forged = await alice
      .from("agent_memories")
      .insert({ content: "planted", user_id: bobId });

    assert.strictEqual(forged.error?.code, "42501");
  });

  // KeepInTax: the agent's user is the pair (actor, data owner); a
  // conversation covers any of the owner's businesses and records the one
  // it started in (AgentTable.recordsBusiness), which nothing changes.
  describe("a conversation across the owner's businesses", () => {
    let agentUserId: string;
    let inFirst: ReturnType<typeof createUserDatabaseClient>;
    const conversationId = crypto.randomUUID();
    let memoryId: string;

    beforeAll(async () => {
      const uid = `owner-${crypto.randomUUID()}`;
      agentUserId = await resolveAgentUserId(database, uid, uid);
      inFirst = createUserDatabaseClient(database, agentUserId, "510000001");

      const lease = await run(
        claimAgentChatAnswer(inFirst, {
          conversationId,
          name: null,
          pinned: false,
          streamId: crypto.randomUUID(),
        })
      );

      if (lease === "busy" || lease === "missing") {
        throw new TypeError("the lease was not claimed");
      }

      await run(
        writeStoredAgentChatMessages(inFirst, conversationId, [
          message(crypto.randomUUID(), "user", "fuel for the first business"),
        ])
      );

      memoryId = await run(
        insertStoredAgentMemory(inFirst, "Answers in shekels", conversationId)
      );

      await run(releaseAgentChatAnswer(inFirst, lease));
    });

    it.each([
      ["another of the owner's businesses", "510000002"],
      ["no business chosen", null],
    ])(
      "continues from %s: history, search, memory and the next answer",
      async (_from, businessNumber) => {
        const other = createUserDatabaseClient(
          database,
          agentUserId,
          businessNumber
        );

        const messages = await run(
          readStoredAgentChatMessages(other, conversationId)
        );

        assert.strictEqual(messages.length, 1);

        const chats = await run(readStoredAgentChatConversations(other));
        assert.isTrue(chats.some((chat) => chat.id === conversationId));

        const found = await run(
          searchStoredAgentChatConversations(other, "fuel")
        );

        assert.include(found, conversationId);

        const memories = await run(readStoredAgentMemories(other));
        assert.isTrue(memories.some((memory) => memory.id === memoryId));

        const lease = await run(
          claimAgentChatAnswer(other, {
            conversationId,
            name: null,
            pinned: false,
            streamId: crypto.randomUUID(),
          })
        );

        if (lease === "busy" || lease === "missing") {
          throw new TypeError(`the conversation was ${lease}`);
        }

        await run(releaseAgentChatAnswer(other, lease));
      }
    );

    it("keeps the business it started in, which no request changes", async () => {
      const other = createUserDatabaseClient(
        database,
        agentUserId,
        "510000002"
      );

      const moved = await other
        .from("agent_chat_conversations")
        .update({ business_number: "510000002" })
        .eq("id", conversationId);

      assert.strictEqual(moved.error?.code, "42501");

      const { rows } = await database.query(
        "SELECT business_number FROM agent_chat_conversations WHERE id = ?",
        [conversationId]
      );

      assert.strictEqual(rows[0]?.business_number, "510000001");
    });

    it("stays out of reach of another data owner, whatever the business", async () => {
      const stranger = `stranger-${crypto.randomUUID()}`;
      const strangerId = await resolveAgentUserId(database, stranger, stranger);
      const other = createUserDatabaseClient(database, strangerId, "510000001");

      const messages = await run(
        readStoredAgentChatMessages(other, conversationId)
      );

      assert.strictEqual(messages.length, 0);

      const claim = await run(
        claimAgentChatAnswer(other, {
          conversationId,
          name: null,
          pinned: false,
          streamId: crypto.randomUUID(),
        })
      );

      assert.strictEqual(claim, "missing");
    });
  });
});
