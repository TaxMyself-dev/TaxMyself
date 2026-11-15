import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { assert, describe, it } from "@effect/vitest";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { Effect, Layer, Option, Schedule, Schema } from "effect";

import { JourneyTimingLog } from "../../../../../backend/shared/observability/journey-timing";
import { respondToAgentChat } from "../../../../../src/agent/chat/turn/agent-chat-endpoint.server";
import { AgentLanguageModel } from "../../../../../src/agent/core/model/agent-model";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";
import { SupabaseRequestClient } from "../../../../../src/server/runtime/supabase-client";
import type { AgentEvalWrite } from "../../../../evals/agent/harness/agent-eval-fixtures";
import { evalUserId } from "../../../../evals/agent/harness/agent-eval-fixtures";
import { createAgentEvalSession } from "../../../../evals/agent/harness/agent-eval-scenario";

// KeepInTax (Phase 3.1, A18, plan §2.6): askUserQuestion answered by the
// page and validated by the server, through the real chat endpoint with a
// scripted model: the answer stops on the open question; the page's answer
// continues the same answer with { value, label }; a repeated, stale or
// foreign answer changes nothing; a typed message closes the question as
// superseded; a question stored by the template still loads. Live clock:
// the answer is saved and its lease freed after the response is read.

const test = it.live;

const decodeChatError = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ error: Schema.Struct({ code: Schema.String }) })
  )
);

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const reply = (text: string): LanguageModelV4StreamPart[] => [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
];

const businessQuestion = {
  question: "באיזה עסק לבדוק?",
  options: [
    { label: "סטודיו נועה", value: "514789632" },
    { label: "נועה קרמיקה", value: "039876541" },
    { label: "בשני העסקים", value: "all" },
  ],
};

const askBusiness: LanguageModelV4StreamPart[] = [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: "יש לכם שני עסקים." },
  { type: "text-end", id: "t" },
  {
    type: "tool-call",
    toolCallId: "ask-1",
    toolName: "askUserQuestion",
    input: JSON.stringify(businessQuestion),
  },
  {
    type: "finish",
    finishReason: { unified: "tool-calls", raw: "tool_calls" },
    usage,
  },
];

const chatServices = (
  supabase: ReturnType<typeof createAgentEvalSession>,
  model: MockLanguageModelV4
) =>
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
  );

// A stored message as the table returns it.
const storedRowsSchema = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    role: Schema.String,
    parts: Schema.Array(Schema.Unknown),
  })
);

type StoredRow = (typeof storedRowsSchema.Type)[number];

// A message the page sends: the user's new one, or the stored answer back.
interface SentChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly parts: readonly unknown[];
}

const userMessage = (text: string): SentChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  parts: [{ type: "text", text }],
});

/**
 * One conversation through the endpoint: the model answers each call from
 * the script, by call number; every prompt is kept.
 *
 * @param script - The model's reply to each call, by call number.
 * @param stored - The conversation stored before the first request.
 * @returns The conversation's send, its stored messages, the prompts and
 *   the tools each call was offered.
 */
const startChat = (
  script: (call: number) => LanguageModelV4StreamPart[],
  stored: AgentChatMessage[] = []
) => {
  const writes: AgentEvalWrite[] = [];
  const conversationId = crypto.randomUUID();
  const prompts: string[] = [];
  // The tools each model call was offered, by name.
  const offered: string[][] = [];

  const supabase = createAgentEvalSession(
    {
      data: {
        agent_chat_conversations:
          stored.length === 0
            ? []
            : [
                {
                  id: conversationId,
                  user_id: evalUserId,
                  name: null,
                  pinned: false,
                  active_stream_id: null,
                },
              ],
        agent_chat_messages: stored.map((message, index) => ({
          id: message.id,
          conversation_id: conversationId,
          user_id: evalUserId,
          role: message.role,
          // Stored as JSON, as the table keeps them.
          parts: Schema.decodeUnknownSync(Schema.Json)(message.parts),
          created_at: new Date(Date.UTC(2026, 9, 4, 9, index)).toISOString(),
          finished_at: null,
        })),
      },
    },
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
    doStream: async ({ prompt, tools }) => {
      prompts.push(JSON.stringify(prompt));
      offered.push((tools ?? []).map((tool) => tool.name));

      return await Promise.resolve({
        stream: convertArrayToReadableStream(script(prompts.length)),
      });
    },
  });

  const messages = Effect.promise(
    async () =>
      await supabase
        .from("agent_chat_messages")
        .select("id, role, parts")
        .eq("conversation_id", conversationId)
  ).pipe(
    Effect.map(({ data }) =>
      Schema.decodeUnknownSync(storedRowsSchema)(data ?? [])
    )
  );

  // Sends one request and, when it answers, reads it to its end and waits
  // until its answer is saved and the lease is free.
  const send = (
    message: SentChatMessage,
    extra: { readonly origin?: "follow-up" } = {}
  ) =>
    Effect.gen(function* sendChat() {
      const before = prompts.length;

      const response = yield* respondToAgentChat(
        new Request("http://localhost/api/agent/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: evalUserId,
            id: conversationId,
            message,
            conversation: { name: null, pinned: false },
            locale: "he",
            ...extra,
          }),
        })
      ).pipe(Effect.provide(chatServices(supabase, model)));

      const text = yield* Effect.promise(async () => await response.text());

      if (response.status === 200) {
        // The answer is saved once the stream ended (onEnd): wait until the
        // stored messages end with it and stop changing.
        let last = "";

        yield* messages.pipe(
          Effect.map((rows) => JSON.stringify(rows)),
          Effect.filterOrFail((rows) => {
            const settled = rows === last && rows.includes('"assistant"');
            last = rows;

            return settled;
          }),
          Effect.retry({ schedule: Schedule.spaced("30 millis"), times: 60 }),
          Effect.orElseSucceed(() => null)
        );
      }

      return {
        status: response.status,
        text,
        newPrompts: prompts.slice(before),
      };
    });

  return { send, messages, userMessage, prompts, offered };
};

const decodeQuestionPart = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.Literal("tool-askUserQuestion"),
    toolCallId: Schema.String,
    state: Schema.String,
    input: Schema.Unknown,
    output: Schema.optional(Schema.Unknown),
  })
);

const decodeTurnOriginPart = Schema.decodeUnknownOption(
  Schema.Struct({
    type: Schema.Literal("data-turnOrigin"),
    data: Schema.Struct({ origin: Schema.String }),
  })
);

// The stored answer as the page sends it back with its answer to the open
// question (AI SDK Chat's addToolOutput): the part with an output.
const answeredBy = (
  answer: StoredRow | undefined,
  value: string,
  label = "made up by the page"
): SentChatMessage => ({
  id: answer?.id ?? "",
  role: "assistant",
  parts: (answer?.parts ?? []).map((part) =>
    Option.match(decodeQuestionPart(part), {
      onNone: () => part,
      onSome: (question) => ({
        ...question,
        state: "output-available",
        output: { value, label },
      }),
    })
  ),
});

const questionPart = (message: StoredRow | undefined) =>
  (message?.parts ?? [])
    .flatMap((part) => Option.toArray(decodeQuestionPart(part)))
    .at(0);

const turnOrigins = (message: StoredRow | undefined) =>
  (message?.parts ?? []).flatMap((part) =>
    Option.toArray(decodeTurnOriginPart(part)).map(({ data }) => data.origin)
  );

describe("askUserQuestion answered by the page", () => {
  test("the answer stops on the open question and continues the same answer with the chosen value", () =>
    Effect.gen(function* questionContinues() {
      const chat = startChat((call) =>
        call === 1 ? askBusiness : reply("בסטודיו נועה הוצאתם 1,662 ₪ על דלק.")
      );

      const first = yield* chat.send(userMessage("כמה הוצאתי על דלק השנה?"));

      assert.strictEqual(first.status, 200);
      // One model call: the loop stopped on the call it cannot run.
      assert.lengthOf(first.newPrompts, 1);

      const [user, asked] = yield* chat.messages;
      assert.strictEqual(user?.role, "user");
      assert.deepStrictEqual(turnOrigins(user), ["typed"]);
      assert.strictEqual(questionPart(asked)?.state, "input-available");

      const second = yield* chat.send(answeredBy(asked, "514789632"));

      assert.strictEqual(second.status, 200);
      assert.include(second.text, "1,662");

      // The model read the answer as the question's result, the stored
      // option's label and not the page's, after the original request.
      const prompt = second.newPrompts[0] ?? "";
      assert.include(prompt, "כמה הוצאתי על דלק השנה?");
      assert.include(prompt, "514789632");
      assert.include(prompt, "סטודיו נועה");
      assert.notInclude(prompt, "made up by the page");

      // Still two messages: the same answer continued, answered, with its
      // origin recorded.
      const after = yield* chat.messages;
      assert.lengthOf(after, 2);
      assert.strictEqual(after[1]?.id, asked?.id);
      assert.deepStrictEqual(questionPart(after[1])?.output, {
        value: "514789632",
        label: "סטודיו נועה",
      });
      assert.deepStrictEqual(turnOrigins(after[1]), ["question-answer"]);
      assert.include(JSON.stringify(after[1]?.parts), "1,662");
    }));

  test("a second press, a press from another tab or a value it does not offer changes nothing", () =>
    Effect.gen(function* questionOnce() {
      const chat = startChat((call) =>
        call === 1 ? askBusiness : reply("ענו על השאלה.")
      );

      yield* chat.send(userMessage("כמה הוצאתי על דלק השנה?"));
      const [, asked] = yield* chat.messages;
      const open = asked ?? { id: "", parts: [] };

      const invalid = yield* chat.send(answeredBy(open, "999999999"));
      assert.strictEqual(invalid.status, 400);
      assert.strictEqual(
        decodeChatError(invalid.text).error.code,
        "AGENT_QUESTION_ANSWER_INVALID"
      );
      assert.lengthOf(invalid.newPrompts, 0);
      assert.strictEqual(
        questionPart((yield* chat.messages)[1])?.state,
        "input-available"
      );

      const accepted = yield* chat.send(answeredBy(open, "all"));
      assert.strictEqual(accepted.status, 200);

      // The same press again, or another tab's press on the same open
      // question: closed, no model call, nothing stored changes.
      const stored = JSON.stringify(yield* chat.messages);

      for (const value of ["all", "039876541"]) {
        const repeated = yield* chat.send(answeredBy(open, value));
        assert.strictEqual(repeated.status, 409);
        assert.strictEqual(
          decodeChatError(repeated.text).error.code,
          "AGENT_QUESTION_CLOSED"
        );
        assert.lengthOf(repeated.newPrompts, 0);
      }

      assert.strictEqual(JSON.stringify(yield* chat.messages), stored);
      assert.lengthOf(chat.prompts, 2);
    }));

  test("a typed message closes the open question as superseded, and a stale press after it changes nothing", () =>
    Effect.gen(function* questionSuperseded() {
      const chat = startChat((call) =>
        call === 1 ? askBusiness : reply("בסדר, נבדוק את ההכנסות.")
      );

      yield* chat.send(userMessage("כמה הוצאתי על דלק השנה?"));
      const [, asked] = yield* chat.messages;

      const typed = yield* chat.send(userMessage("עזבו, מה ההכנסות שלי?"));
      assert.strictEqual(typed.status, 200);

      // The model read the question as superseded, then the newer message;
      // a call with no output would have failed the request.
      const prompt = typed.newPrompts[0] ?? "";
      assert.include(prompt, "superseded");
      assert.include(prompt, "עזבו, מה ההכנסות שלי?");

      const after = yield* chat.messages;
      assert.deepStrictEqual(questionPart(after[1])?.output, {
        superseded: true,
      });

      const stale = yield* chat.send(answeredBy(asked, "514789632"));

      assert.strictEqual(stale.status, 409);
      assert.strictEqual(
        decodeChatError(stale.text).error.code,
        "AGENT_QUESTION_CLOSED"
      );
      assert.lengthOf(stale.newPrompts, 0);
    }));

  test("a pressed follow-up is recorded only when it is one of the stored follow-ups", () =>
    Effect.gen(function* followUpOrigin() {
      const answerId = crypto.randomUUID();

      const chat = startChat(
        () => reply("לפי חודשים: ינואר 300 ₪."),
        [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: "כמה הוצאתי על דלק השנה?" }],
          },
          {
            id: answerId,
            role: "assistant",
            parts: [
              { type: "text", text: "1,662 ₪ על דלק." },
              {
                type: "data-followUps",
                data: { questions: ["ואיך זה מתחלק לפי חודשים?"] },
              },
            ],
          },
        ]
      );

      // Claimed and stored: a follow-up of that answer.
      yield* chat.send(userMessage("ואיך זה מתחלק לפי חודשים?"), {
        origin: "follow-up",
      });
      const pressed = (yield* chat.messages).at(-2);
      assert.deepStrictEqual(turnOrigins(pressed), ["follow-up"]);
      assert.include(JSON.stringify(pressed?.parts), answerId);

      // Claimed but not stored under the last answer: typed.
      yield* chat.send(userMessage("תזכור שאני אוהב פירוט חודשי"), {
        origin: "follow-up",
      });
      assert.deepStrictEqual(turnOrigins((yield* chat.messages).at(-2)), [
        "typed",
      ]);
    }));

  test("a conversation stored with the template's label-only question still loads and continues", () =>
    Effect.gen(function* legacyQuestion() {
      const chat = startChat(
        () => reply("1,662 ₪."),
        [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: "כמה הוצאתי על דלק?" }],
          },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [
              {
                type: "tool-askUserQuestion",
                toolCallId: "old-ask",
                state: "output-available",
                input: {
                  question: "באיזה עסק?",
                  options: ["סטודיו נועה", "נועה קרמיקה"],
                },
                output: { asked: true },
              },
              {
                type: "tool-searchWeb",
                toolCallId: "old-search",
                state: "output-available",
                input: { query: "מחירי דלק", maxResults: 3 },
                output: [],
              },
            ],
          },
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: "סטודיו נועה" }],
          },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [{ type: "text", text: "1,662 ₪." }],
          },
        ]
      );

      const next = yield* chat.send(userMessage("ובחודש האחרון?"));
      assert.strictEqual(next.status, 200);

      // The old calls reach the model as history, but neither searchWeb nor
      // the tracking tools are offered.
      const prompt = next.newPrompts[0] ?? "";
      assert.include(prompt, "old-ask");
      assert.include(prompt, "old-search");

      const tools = chat.offered.at(-1) ?? [];
      assert.include(tools, "queryExpenses");
      assert.include(tools, "askUserQuestion");

      for (const hidden of [
        "searchWeb",
        "sendEmail",
        "createTrackingTask",
        "listTrackingTasks",
        "suggestTrackingTasks",
        "listTaskOpportunities",
        "loadAgentSkill",
      ]) {
        assert.notInclude(tools, hidden);
      }
    }));
});
