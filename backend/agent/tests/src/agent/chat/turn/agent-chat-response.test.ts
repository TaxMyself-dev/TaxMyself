import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { assert, describe, effect as test } from "@effect/vitest";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { Effect, Layer, Schedule, Schema } from "effect";

import { JourneyTimingLog } from "../../../../../backend/shared/observability/journey-timing";
import { respondToAgentChat } from "../../../../../src/agent/chat/turn/agent-chat-endpoint.server";
import { agentInstructions } from "../../../../../src/agent/core/agent/agent-instructions";
import { AgentLanguageModel } from "../../../../../src/agent/core/model/agent-model";
import { SupabaseRequestClient } from "../../../../../src/server/runtime/supabase-client";
import { makeFakeSupabaseClient } from "../../../../backend/shared/fixtures/fake-supabase-client";
import type { AgentEvalWrite } from "../../../../evals/agent/harness/agent-eval-fixtures";
import { evalUserId } from "../../../../evals/agent/harness/agent-eval-fixtures";
import { createAgentEvalSession } from "../../../../evals/agent/harness/agent-eval-scenario";

const decodeChatError = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ error: Schema.Struct({ code: Schema.String }) })
  )
);

const userId = "00000000-0000-4000-8000-000000000001";

// The app's other services: the model is built but never called, and
// timings are not kept.
const chatServicesTest = Layer.merge(
  AgentLanguageModel.layer,
  Layer.succeed(
    JourneyTimingLog,
    JourneyTimingLog.of({
      file: null,
      append: () => Effect.void,
      readAll: Effect.succeedNone,
    })
  )
);

const otherUserId = "00000000-0000-4000-8000-000000000002";

interface ChatBoundaryCase {
  readonly description: string;
  readonly headers?: Record<string, string>;
  readonly signedIn?: boolean;
  readonly body?: string;
  readonly status: number;
  readonly code: string;
  // Whether the request got as far as creating the user's client.
  readonly clientCreated: boolean;
}

const chatMessage = JSON.stringify({
  userId: otherUserId,
  id: crypto.randomUUID(),
  message: {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: "שלום" }],
  },
  conversation: { name: null, pinned: false },
});

const chatBoundaryCases: ChatBoundaryCase[] = [
  {
    description: "chat rejects a foreign origin before opening storage",
    headers: { origin: "https://other.example" },
    status: 403,
    code: "AGENT_INVALID_ORIGIN",
    clientCreated: false,
  },
  {
    description:
      "chat rejects cross-site browser requests before opening storage",
    headers: { "sec-fetch-site": "cross-site" },
    status: 403,
    code: "AGENT_INVALID_ORIGIN",
    clientCreated: false,
  },
  {
    description: "chat rejects a non-JSON request before opening storage",
    headers: { "content-type": "text/plain" },
    status: 415,
    code: "AGENT_INVALID_INPUT",
    clientCreated: false,
  },
  {
    description: "chat cannot write without a signed-in session",
    signedIn: false,
    status: 401,
    code: "AGENT_AUTH_REQUIRED",
    clientCreated: true,
  },
  {
    description: "malformed chat JSON cannot write a conversation",
    body: "{",
    status: 400,
    code: "AGENT_INVALID_INPUT",
    clientCreated: true,
  },
  {
    description: "a delayed chat request cannot write to the new account",
    status: 401,
    code: "AGENT_AUTH_REQUIRED",
    clientCreated: true,
  },
];

// The stored chat messages, read again until the answer is saved.
const supabaseTable = (supabase: ReturnType<typeof createAgentEvalSession>) =>
  Effect.promise(
    async () => await supabase.from("agent_chat_messages").select("role, parts")
  ).pipe(Effect.map(({ data }) => data ?? []));

const scriptedUsage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

// A model reply that writes this text, or nothing when it is empty.
const scriptedReply = (text: string): LanguageModelV4StreamPart[] => [
  { type: "stream-start", warnings: [] },
  ...(text === ""
    ? []
    : [
        { type: "text-start" as const, id: "t" },
        { type: "text-delta" as const, id: "t", delta: text },
        { type: "text-end" as const, id: "t" },
      ]),
  {
    type: "finish",
    finishReason: { unified: "stop", raw: "stop" },
    usage: scriptedUsage,
  },
];

// One answer through the real endpoint, with a scripted model and no key
// (DeepSeek's postmortem 0001: a test of the real entry path): the model's
// replies come from script, by call number. Answers what the model saw on
// each call, the streamed response and the stored messages.
const answerThroughEndpoint = (
  script: (call: number) => LanguageModelV4StreamPart[]
) =>
  Effect.gen(function* scriptedAnswer() {
    const prompts: string[] = [];
    const writes: AgentEvalWrite[] = [];

    const supabase = createAgentEvalSession(
      { data: { agent_chat_conversations: [] } },
      writes
    );

    Object.assign(supabase.auth, {
      getClaims: async () =>
        await Promise.resolve({
          data: { claims: { sub: evalUserId } },
          error: null,
        }),
    });

    const model = new MockLanguageModelV4({
      doStream: async ({ prompt }) => {
        prompts.push(JSON.stringify(prompt));

        return await Promise.resolve({
          stream: convertArrayToReadableStream(script(prompts.length)),
        });
      },
    });

    const response = yield* respondToAgentChat(
      new Request("http://localhost/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: evalUserId,
          id: crypto.randomUUID(),
          message: {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: "מה המשימות שלי?" }],
          },
          conversation: { name: null, pinned: false },
          // The page sends its language with each chat request; without it
          // the answer runs in English (agent-chat-answer-run.server.ts).
          locale: "he",
        }),
      })
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(
            SupabaseRequestClient,
            SupabaseRequestClient.of({ client: Effect.succeed(supabase) })
          ),
          Layer.succeed(AgentLanguageModel, AgentLanguageModel.of({ model })),
          Layer.succeed(
            JourneyTimingLog,
            JourneyTimingLog.of({
              file: null,
              append: () => Effect.void,
              readAll: Effect.succeedNone,
            })
          )
        )
      )
    );

    assert.strictEqual(response.status, 200);

    const stream = yield* Effect.promise(async () => await response.text());

    // Saved once the stream ended; the lease is released.
    const saved = yield* supabaseTable(supabase).pipe(
      Effect.filterOrFail((rows) =>
        rows.some((row) => row.role === "assistant")
      ),
      Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 50 }),
      Effect.orElseSucceed(() => [])
    );

    return { prompts, stream, saved };
  });

describe("agent chat answer through the endpoint", () => {
  const planStep = "לבדוק את המשימות";
  const finalText = "בדקתי, אין משימות פעילות.";

  // The model opens a plan step, then answers with it still open: the plan
  // gate sends it back twice through the chat's own stop hooks.
  test("an answer streams, saves, and the plan gate runs on the way", () =>
    Effect.gen(function* planGateThroughEndpoint() {
      const { prompts, stream, saved } = yield* answerThroughEndpoint((call) =>
        call === 1
          ? [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "plan-1",
                toolName: "updatePlan",
                input: JSON.stringify({
                  steps: [{ text: planStep, status: "pending" }],
                }),
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: scriptedUsage,
              },
            ]
          : scriptedReply(finalText)
      );

      assert.include(stream, finalText);

      // The instructions are the same for every user; the user's settings
      // come as the user context, a message before theirs.
      assert.include(
        prompts[0] ?? "",
        JSON.stringify({ role: "system", content: agentInstructions("he") })
      );
      assert.include(prompts[0] ?? "", "<user_context>");
      // The skill list is a message at the conversation's start, not part of
      // the instructions.
      assert.include(prompts[0] ?? "", "the playbooks you can load");
      assert.notInclude(agentInstructions("he"), "<skills>");

      // The plan gate sent the answer back twice, then let it end.
      assert.lengthOf(prompts, 4);
      assert.include(prompts[2] ?? "", "Your plan still has open steps");
      assert.include(prompts[3] ?? "", planStep);

      // The user's message with its context, then the answer.
      assert.deepStrictEqual(
        saved.map((row) => row.role),
        ["user", "assistant"]
      );
      assert.include(JSON.stringify(saved[0]?.parts), "data-userContext");
      assert.include(JSON.stringify(saved[1]?.parts), finalText);

      // The plan gate's two notes are saved where they came, for later turns.
      const savedNotes = JSON.stringify(saved[1]?.parts).match(
        /data-agentNote/gu
      );

      assert.lengthOf(savedNotes ?? [], 2);
    }));

  // The model's first reply is empty: the chat sends it back to answer.
  test("an empty reply is sent back once and the answer still comes", () =>
    Effect.gen(function* emptyReplyThroughEndpoint() {
      const { prompts, stream } = yield* answerThroughEndpoint((call) =>
        scriptedReply(call === 1 ? "" : finalText)
      );

      assert.lengthOf(prompts, 2);
      assert.include(prompts[1] ?? "", "Your last reply was empty");
      assert.include(stream, finalText);
    }));
});

describe("agent chat request boundary", () => {
  test.each(chatBoundaryCases)("$description", (chatCase) =>
    Effect.gen(function* rejectChatRequest() {
      let clientCreated = false;

      // The request's signed-in client, created on first use as the live one
      // is; rejected requests never reach storage.
      const requestClient = Layer.succeed(
        SupabaseRequestClient,
        SupabaseRequestClient.of({
          client: Effect.sync(() => {
            clientCreated = true;

            return makeFakeSupabaseClient(
              async () =>
                await Promise.reject(
                  new Error("Rejected chat requests must not reach storage")
                ),
              {
                getClaims: async () =>
                  await Promise.resolve({
                    data:
                      chatCase.signedIn === false
                        ? null
                        : { claims: { sub: userId } },
                    error: null,
                  }),
              }
            );
          }),
        })
      );

      const response = yield* respondToAgentChat(
        new Request("http://localhost/api/agent/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...chatCase.headers,
          },
          body: chatCase.body ?? chatMessage,
        })
      ).pipe(Effect.provide(Layer.merge(requestClient, chatServicesTest)));

      assert.strictEqual(response.status, chatCase.status);

      const body = decodeChatError(
        yield* Effect.promise(async () => await response.text())
      );

      assert.strictEqual(body.error.code, chatCase.code);
      assert.strictEqual(clientCreated, chatCase.clientCreated);
    })
  );
});
