import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import type { BusinessView } from "../../../../../src/agent/core/ports/keepintax-ports";
import { agentAnswerBusinessViolations } from "../../../../../src/agent/core/turn/agent-answer-check";
import {
  agentBusinessesSection,
  agentConversationBusiness,
  agentConversationBusinessState,
  businessContextPart,
  namedBusinesses,
  withAgentBusinessContext,
  withConversationBusiness,
} from "../../../../../src/agent/tools/books/agent-conversation-business";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";
import {
  evalBooks,
  evalCeramicsBusiness,
  evalDesignerBusiness,
} from "../../../../evals/agent/harness/agent-eval-books";

// Business selection (2026-11-15, docs/research/
// assistant-qa-verification-2026-11-15.md §8): the chat reads the business
// the user names, chose or established in the conversation, never a header
// another screen left behind; with several and none settled it asks.

// The QA demo's businesses (docs/operations/assistant-qa-demo.md).
const studio: BusinessView = {
  number: "999100012",
  name: "סטודיו הדגמה - מורשה",
};

const consulting: BusinessView = {
  number: "999100020",
  name: "ייעוץ הדגמה - פטור",
};

const directory = [studio, consulting];

// The evals' two businesses, for reads through their books.
const designer = evalDesignerBusiness;
const ceramics = evalCeramicsBusiness;
const evalDirectory = [designer, ceramics];

const range = { from: "2026-01-01", to: "2026-11-15" };

const userSays = (
  text: string,
  businesses: readonly BusinessView[] = directory
): AgentChatMessage => {
  const [recorded] = withAgentBusinessContext(
    [
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      },
    ],
    businesses
  );

  if (recorded === undefined) {
    throw new TypeError("no message");
  }

  return recorded;
};

// The fields of a stored tool call's input or output these tests use.
interface ToolFields {
  readonly from?: string;
  readonly to?: string;
  readonly search?: string;
  readonly businessNumber?: string;
  readonly allBusinesses?: boolean;
  readonly question?: string;
  readonly options?: readonly string[];
  readonly value?: string;
  readonly label?: string;
  readonly business?: BusinessView;
}

const toolCall = (
  name: string,
  input: ToolFields,
  state = "output-available",
  output: ToolFields = {}
) => ({
  type: `tool-${name}`,
  toolCallId: crypto.randomUUID(),
  state,
  input,
  output,
});

const answerWith = (...parts: ReturnType<typeof toolCall>[]) => ({
  role: "assistant",
  parts,
});

const pressed = (value: string) =>
  answerWith(
    toolCall(
      "askUserQuestion",
      { question: "באיזה עסק?", options: [] },
      "output-available",
      { value, label: value }
    )
  );

// Books as the Nest backend resolves them, no header: the business asked
// for, else the only one, else BUSINESS_REQUIRED.
const twoBusinessBooks = () => evalBooks([], { businesses: evalDirectory });

const profitOf = async (
  books: ReturnType<typeof twoBusinessBooks>["books"],
  businessNumber?: string
) =>
  await Effect.runPromiseExit(
    books.getProfitAndLoss(
      businessNumber === undefined ? range : { ...range, businessNumber }
    )
  );

describe("names in the user's words", () => {
  it("finds a business by its full name, its part before ' - ', or its number, despite punctuation and prefixes", () => {
    expect(
      namedBusinesses(
        "מה ההכנסות והרווח בעסק ייעוץ הדגמה - פטור בשנת 2026?",
        directory
      )
    ).toStrictEqual([consulting.number]);
    expect(
      namedBusinesses('מה הרווח ב"ייעוץ הדגמה"?', directory)
    ).toStrictEqual([consulting.number]);
    expect(namedBusinesses("ובסטודיו הדגמה?", directory)).toStrictEqual([
      studio.number,
    ]);
    expect(namedBusinesses("הדוח של 999100020", directory)).toStrictEqual([
      consulting.number,
    ]);
    expect(
      namedBusinesses("השווה את סטודיו הדגמה לייעוץ הדגמה", directory)
    ).toStrictEqual([studio.number, consulting.number]);
  });

  it("finds none in ordinary wording, never a part of a word", () => {
    expect(
      namedBusinesses("כמה הוצאתי על דלק בשנת 2026?", directory)
    ).toStrictEqual([]);
    expect(namedBusinesses("הדגמה", directory)).toStrictEqual([]);
    expect(namedBusinesses("סטודיו הדגמהות", directory)).toStrictEqual([]);
    expect(namedBusinesses("9991000200", directory)).toStrictEqual([]);
  });

  it("records the names on the user's message only, once", () => {
    const named = userSays("מה הרווח בייעוץ הדגמה?");

    expect(named.parts[0]).toStrictEqual({
      type: businessContextPart,
      data: { numbers: [consulting.number] },
    });

    const [again] = withAgentBusinessContext([named], directory);

    expect(
      again?.parts.filter((part) => part.type === businessContextPart)
    ).toHaveLength(1);

    const answer: AgentChatMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "ייעוץ הדגמה" }],
    };

    expect(withAgentBusinessContext([named, answer], directory).at(-1)).toBe(
      answer
    );
  });
});

describe("the conversation's business", () => {
  it("a new chat naming the second business reads it, header or no header", async () => {
    const { books, reads } = twoBusinessBooks();

    const state = agentConversationBusinessState(evalDirectory, [
      userSays(`מה ההכנסות והרווח ב${ceramics.name} בשנת 2026?`, evalDirectory),
    ]);

    expect(state.current).toBe(ceramics.number);

    const exit = await profitOf(withConversationBusiness(books, state));

    expect(Exit.isSuccess(exit)).toBeTruthy();
    expect(reads.map(({ query }) => query.businessNumber)).toStrictEqual([
      ceramics.number,
    ]);
  });

  it("an ambiguous request with several businesses reads none: BUSINESS_REQUIRED (the buttons)", async () => {
    const { books, reads } = twoBusinessBooks();

    const state = agentConversationBusinessState(evalDirectory, [
      userSays("כמה הוצאתי על דלק בשנת 2026?", evalDirectory),
    ]);

    expect(state.current).toBeNull();

    const exit = await profitOf(withConversationBusiness(books, state));

    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(String(exit)).toMatch(/BUSINESS_REQUIRED/u);
    expect(reads.map(({ query }) => query.businessNumber)).toStrictEqual([
      undefined,
    ]);
  });

  it("the only business needs no choice", async () => {
    const { books } = evalBooks([], { businesses: [designer] });

    const state = agentConversationBusinessState(
      [designer],
      [userSays("כמה הוצאתי על דלק?", [designer])]
    );

    const exit = await profitOf(withConversationBusiness(books, state));

    expect(Exit.isSuccess(exit)).toBeTruthy();
  });

  it("a pressed business button carries on into follow-ups, also after a reload (the stored messages)", async () => {
    const stored = [
      userSays("כמה הוצאתי על דלק בשנת 2026?", evalDirectory),
      pressed(designer.number),
      userSays("תפרט לפי חודשים", evalDirectory),
    ];

    // A reload reads the same stored messages: the same business.
    expect(agentConversationBusiness(stored, evalDirectory)).toBe(
      designer.number
    );

    const { books, reads } = twoBusinessBooks();

    await profitOf(
      withConversationBusiness(
        books,
        agentConversationBusinessState(evalDirectory, stored)
      )
    );

    expect(reads.map(({ query }) => query.businessNumber)).toStrictEqual([
      designer.number,
    ]);
  });

  it("naming another business switches the chat to it", () => {
    const stored = [
      userSays("כמה הוצאתי על דלק בשנת 2026?"),
      pressed(studio.number),
      userSays("ומה הרווח בייעוץ הדגמה?"),
    ];

    expect(agentConversationBusiness(stored, directory)).toBe(
      consulting.number
    );
    expect(
      agentConversationBusiness(
        [...stored, userSays("ובסטודיו הדגמה?")],
        directory
      )
    ).toBe(studio.number);
  });

  it("a read by number establishes the business; a read across businesses, the 'all' button or two businesses in one answer clear it", () => {
    const start = [userSays("כמה הוצאתי על דלק?")];
    const settled = [...start, pressed(studio.number)];

    expect(
      agentConversationBusiness(
        [
          ...start,
          answerWith(
            toolCall("getProfitAndLoss", {
              ...range,
              businessNumber: consulting.number,
            })
          ),
        ],
        directory
      )
    ).toBe(consulting.number);
    expect(
      agentConversationBusiness(
        [
          ...settled,
          answerWith(
            toolCall("queryExpenses", { ...range, allBusinesses: true })
          ),
        ],
        directory
      )
    ).toBeNull();
    expect(
      agentConversationBusiness([...start, pressed("all")], directory)
    ).toBeNull();
    expect(
      agentConversationBusiness(
        [
          ...settled,
          answerWith(
            toolCall("getProfitAndLoss", {
              ...range,
              businessNumber: studio.number,
            }),
            toolCall("getProfitAndLoss", {
              ...range,
              businessNumber: consulting.number,
            })
          ),
        ],
        directory
      )
    ).toBeNull();
    // Naming both in one message settles on neither.
    expect(
      agentConversationBusiness(
        [...settled, userSays("השווה את סטודיו הדגמה לייעוץ הדגמה")],
        directory
      )
    ).toBeNull();
  });

  it("a business no longer in the verified directory (access ended) is never used, and a failed read establishes nothing", () => {
    const stored = [userSays("כמה הוצאתי?"), pressed(consulting.number)];

    expect(agentConversationBusiness(stored, [studio])).toBeNull();
    expect(
      agentConversationBusiness(
        [
          userSays("כמה הוצאתי?"),
          answerWith(
            toolCall(
              "getProfitAndLoss",
              { ...range, businessNumber: consulting.number },
              "output-error"
            )
          ),
        ],
        directory
      )
    ).toBeNull();
  });

  it("a legacy conversation (the header recorded on its row, no choice in its messages) has no business", async () => {
    // agent_chat_conversations.business_number is never an input: only the
    // messages are, and a read that named no business establishes nothing,
    // whatever business it returned.
    const legacy = [
      { role: "user", parts: [{ type: "text", text: "כמה הוצאתי על דלק?" }] },
      answerWith(
        toolCall(
          "queryExpenses",
          { ...range, search: "דלק" },
          "output-available",
          { business: designer }
        )
      ),
    ];

    expect(agentConversationBusiness(legacy, evalDirectory)).toBeNull();

    const { books } = twoBusinessBooks();

    const exit = await profitOf(
      withConversationBusiness(
        books,
        agentConversationBusinessState(evalDirectory, legacy)
      )
    );

    expect(Exit.isFailure(exit)).toBeTruthy();
  });

  it("the model's explicit business wins; reads across businesses pass through and clear the business", async () => {
    const { books, reads, queries } = twoBusinessBooks();

    const state = agentConversationBusinessState(evalDirectory, [
      userSays("כמה הוצאתי?", evalDirectory),
      pressed(designer.number),
    ]);

    const chat = withConversationBusiness(books, state);

    await profitOf(chat, ceramics.number);

    expect(state.current).toBe(ceramics.number);

    await Effect.runPromiseExit(
      chat.queryExpenses({ ...range, allBusinesses: true })
    );

    expect(reads.map(({ query }) => query.businessNumber)).toStrictEqual([
      ceramics.number,
    ]);
    expect(queries).toStrictEqual([{ ...range, allBusinesses: true }]);
    expect(state.current).toBeNull();
  });

  it("names the businesses and the settled one for the model", () => {
    expect(agentBusinessesSection(directory, consulting.number)).toContain(
      "This conversation is about 999100020 (ייעוץ הדגמה - פטור)"
    );
    expect(agentBusinessesSection(directory, null)).toContain(
      "has not settled on one business"
    );
    expect(agentBusinessesSection([], null)).toBe("");
  });
});

// A P&L read that returned, as the answer check sees it.
const outcome = (business: BusinessView) => ({
  toolName: "getProfitAndLoss",
  outcome: "done" as const,
  output: JSON.stringify({ business, income: 7000 }),
});

describe("the answer about the business the user named", () => {
  it("sends back an answer whose reads are all of another business (S20)", () => {
    const violations = agentAnswerBusinessViolations({
      userMessage: "מה ההכנסות והרווח בעסק ייעוץ הדגמה - פטור בשנת 2026?",
      outcomes: [outcome(studio)],
      businesses: directory,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("999100020");
  });

  it("passes the named business's read, a message naming none or both, and a turn with no read", () => {
    const check = (userMessage: string, outcomes = [outcome(studio)]) =>
      agentAnswerBusinessViolations({
        userMessage,
        outcomes,
        businesses: directory,
      });

    expect(check("ובסטודיו הדגמה?")).toStrictEqual([]);
    expect(check("מה הרווח שלי?")).toStrictEqual([]);
    expect(check("השווה את סטודיו הדגמה לייעוץ הדגמה")).toStrictEqual([]);
    expect(check("ומה בייעוץ הדגמה?", [])).toStrictEqual([]);
    expect(
      agentAnswerBusinessViolations({
        userMessage: "ומה בייעוץ הדגמה?",
        outcomes: [outcome(studio)],
      })
    ).toStrictEqual([]);
  });
});
