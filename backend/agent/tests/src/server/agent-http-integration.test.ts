import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
import { afterAll, beforeAll, vi } from "vitest";

import type {
  disposeAppRuntime,
  handleAgentHttpRequest,
} from "@/server/agent-http.server";
import type { AgentRequestUser } from "@/server/runtime/agent-request-identity";

// The agent's HTTP entry (agent-http.server.ts) as the Nest backend calls
// it, against a real MySQL with the agent's tables: the session, server
// functions, the chat endpoint (with no model key, so the answer fails in
// the user's words, and the user's message, the lease and the stream are
// still handled as the template handles them), the stream and stop routes,
// and the origin guard. Needs AGENT_TEST_DATABASE_URL, like the gateway's
// integration test; skipped without it.

const databaseUrl = process.env.AGENT_TEST_DATABASE_URL;

const firebaseId = `firebase-${crypto.randomUUID()}`;

const user: AgentRequestUser = {
  actorFirebaseId: firebaseId,
  firebaseId,
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: false,
  isAdminImpersonation: false,
};

const apiOrigin = "http://api.keepintax.test";

const decodeSession = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ userId: Schema.String }))
);

describe.skipIf(databaseUrl === undefined)("agent HTTP entry", () => {
  // Imported once the database settings are in place: the agent's runtime
  // reads them when it starts.
  let http: {
    handleAgentHttpRequest: typeof handleAgentHttpRequest;
    disposeAppRuntime: typeof disposeAppRuntime;
  };

  beforeAll(async () => {
    const url = new URL(databaseUrl ?? "mysql://localhost/agent_test");
    process.env.AGENT_DB_HOST = url.hostname;
    process.env.AGENT_DB_PORT = url.port || "3306";
    process.env.AGENT_DB_USERNAME = decodeURIComponent(url.username);
    process.env.AGENT_DB_PASSWORD = decodeURIComponent(url.password);
    process.env.AGENT_DB_DATABASE = url.pathname.slice(1);
    process.env.AGENT_APP_ORIGINS = "http://app.keepintax.test";
    delete process.env.OPENAI_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    http = await import("@/server/agent-http.server");
  });

  afterAll(async () => {
    await http?.disposeAppRuntime();
  });

  const call = async (path: string, init: RequestInit = {}) =>
    await http.handleAgentHttpRequest(
      new Request(`${apiOrigin}${path}`, init),
      user
    );

  const session = async () => {
    const response = await call("/api/agent/fn/readAgentSession");
    assert.strictEqual(response.status, 200);
    const { userId } = decodeSession(await response.text());

    return userId;
  };

  // The answer's stream ends (and its lease is released) after its
  // response was read; wait for it before the next step.
  const waitForAnswerEnd = async (conversationId: string) => {
    await vi.waitFor(
      async () => {
        const stream = await call(`/api/agent/chats/${conversationId}/stream`);
        await stream.text();
        assert.strictEqual(stream.status, 204);
      },
      { timeout: 5000, interval: 100 }
    );
  };

  it("answers the session and the user's settings", async () => {
    const userId = await session();
    assert.match(userId, /^[\da-f-]{36}$/u);
    assert.strictEqual(await session(), userId);

    const settings = await call(
      `/api/agent/fn/readUserSettings?data=${encodeURIComponent(JSON.stringify({ userId }))}`
    );

    assert.strictEqual(settings.status, 200);
    assert.include(await settings.text(), "individual");

    const someoneElse = await call(
      `/api/agent/fn/readUserSettings?data=${encodeURIComponent(JSON.stringify({ userId: crypto.randomUUID() }))}`
    );

    assert.strictEqual(someoneElse.status, 401);
  });

  it("runs a chat request end to end: the message saved, the answer streamed, the lease freed", async () => {
    const userId = await session();
    const conversationId = crypto.randomUUID();

    const chat = async (text: string) =>
      await call("/api/agent/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://app.keepintax.test",
        },
        body: JSON.stringify({
          userId,
          id: conversationId,
          message: {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text }],
          },
          conversation: { name: null, pinned: false },
          locale: "en",
        }),
      });

    const first = await chat("What can you do?");
    assert.strictEqual(first.status, 200);
    // Without a model key the answer fails, in the user's words.
    assert.include(await first.text(), '"type":"error"');

    const messages = await call(
      `/api/agent/fn/readAgentChatConversationMessages?data=${encodeURIComponent(JSON.stringify({ userId, conversationId }))}`
    );

    assert.strictEqual(messages.status, 200);
    assert.include(await messages.text(), "What can you do?");

    // Once the answer is saved, its lease is free for the next message: the
    // saving runs after the page has read the stream (consumeSseStream), so
    // the next message may find the chat busy for a moment, as the page can.
    const second = await vi.waitFor(
      async () => {
        const response = await chat("And now?");

        if (response.status === 409) {
          await response.text();
          throw new Error("the chat is still busy");
        }

        return response;
      },
      { timeout: 5000, interval: 100 }
    );

    assert.strictEqual(second.status, 200);
    await second.text();
    await waitForAnswerEnd(conversationId);

    const stream = await call(`/api/agent/chats/${conversationId}/stream`);
    assert.strictEqual(stream.status, 204);

    const stop = await call(`/api/agent/chats/${conversationId}/stop`, {
      method: "POST",
    });

    assert.strictEqual(stop.status, 204);

    const list = await call(
      `/api/agent/fn/listAgentChatConversations?data=${encodeURIComponent(JSON.stringify({ userId }))}`
    );

    assert.include(await list.text(), conversationId);
  });

  it("turns away another site, and requests that are not the signed-in user's", async () => {
    const userId = await session();

    const crossSite = await call("/api/agent/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: "{}",
    });

    assert.strictEqual(crossSite.status, 403);

    const otherUser = await call("/api/agent/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: crypto.randomUUID(),
        id: crypto.randomUUID(),
        message: {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: "hi" }],
        },
        conversation: { name: null, pinned: false },
      }),
    });

    assert.strictEqual(otherUser.status, 401);
    assert.notStrictEqual(userId, "");

    const unknown = await call("/api/agent/nothing-here");
    assert.strictEqual(unknown.status, 404);
  });
});
