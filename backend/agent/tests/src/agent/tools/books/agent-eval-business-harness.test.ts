import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { withConversationBusiness } from "../../../../../src/agent/tools/books/agent-conversation-business";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";
import {
  evalBooks,
  evalCeramicsBusiness,
  evalDesignerBusiness,
} from "../../../../evals/agent/harness/agent-eval-books";
import {
  agentEvalBusinessAfterChoice,
  agentEvalHistoryBusiness,
} from "../../../../evals/agent/harness/agent-eval-step-messages";

// The eval harness's business preparation (2026-11-15): a pressed business
// is the conversation's before the answer's first read, and a stored
// history keeps the business it established, as the chat endpoint does.

const directory = [evalDesignerBusiness, evalCeramicsBusiness];
const studio = evalDesignerBusiness.number;
const ceramics = evalCeramicsBusiness.number;
const range = { from: "2026-01-01", to: "2026-10-04" };

// The business an unnamed read is answered for, with this current business.
const readFor = async (current: string | null) => {
  const { books, reads } = evalBooks([], { businesses: directory });

  const wrapped = withConversationBusiness(books, {
    directory,
    current,
    readByNumber: new Set(),
  });

  const pnl = await Effect.runPromise(wrapped.getProfitAndLoss(range));

  return { business: pnl.business.number, reads };
};

const message = (
  role: "user" | "assistant",
  parts: AgentChatMessage["parts"]
): AgentChatMessage => ({ id: crypto.randomUUID(), role, parts });

const text = (words: string) => [{ type: "text" as const, text: words }];

describe("the eval harness's business", () => {
  it("a pressed business is established before any read", async () => {
    const current = agentEvalBusinessAfterChoice(
      { value: studio, label: evalDesignerBusiness.name },
      { directory, current: null }
    );

    expect(current).toBe(studio);

    const { business, reads } = await readFor(current);

    expect(reads).toHaveLength(1);
    expect(business).toBe(studio);
  });

  it('"all" clears the business; another value keeps it', () => {
    expect(
      agentEvalBusinessAfterChoice(
        { value: "all", label: "כולם" },
        { directory, current: studio }
      )
    ).toBeNull();
    expect(
      agentEvalBusinessAfterChoice(
        { value: "later", label: "אחר כך" },
        { directory, current: ceramics }
      )
    ).toBe(ceramics);
  });

  it("a stored history restores the business it established", async () => {
    const { business } = agentEvalHistoryBusiness(
      [
        message("user", text(`כמה דלק ב${evalCeramicsBusiness.name}?`)),
        message("assistant", text("431.15 ₪")),
        message("user", text("ומה עם חומרי גלם?")),
      ],
      directory
    );

    const { books } = evalBooks([], { businesses: directory });

    const earlierRead = await Effect.runPromise(
      books.queryExpenses({ ...range, businessNumber: ceramics })
    );

    // Established by an earlier answer's read by number.
    const fromRead = agentEvalHistoryBusiness(
      [
        message("user", text("כמה דלק?")),
        message("assistant", [
          {
            type: "tool-queryExpenses",
            toolCallId: "q1",
            state: "output-available",
            input: {
              from: "2026-01-01",
              to: "2026-10-04",
              businessNumber: ceramics,
            },
            output: earlierRead,
          },
        ]),
        message("user", text("ומה עם חומרי גלם?")),
      ],
      directory
    );

    expect(business.current).toBe(ceramics);
    expect(fromRead.business.current).toBe(ceramics);
    const restored = await readFor(fromRead.business.current);

    expect(restored.business).toBe(ceramics);
  });

  it("naming the other business in the new message overrides the history", () => {
    const { business } = agentEvalHistoryBusiness(
      [
        message("assistant", [
          {
            type: "tool-askUserQuestion",
            toolCallId: "q1",
            state: "output-available",
            input: { question: "באיזה עסק?", options: [] },
            output: { value: ceramics, label: evalCeramicsBusiness.name },
          },
        ]),
        message("user", text(`ומה ב${evalDesignerBusiness.name}?`)),
      ],
      directory
    );

    expect(business.current).toBe(studio);
  });

  // The legacy agent_chat_conversations.business_number (the page header
  // when the chat started) is not a stored message, so the reader never
  // sees it: a history with no named, pressed or read business has none,
  // and an unnamed read asks which (no page default in the fakes either).
  it("a legacy page-header value is not a user choice", async () => {
    const { business } = agentEvalHistoryBusiness(
      [message("user", text("כמה דלק?"))],
      directory
    );

    expect(business.current).toBeNull();

    const { books } = evalBooks([], { businesses: directory });

    const unnamed = await Effect.runPromiseExit(
      withConversationBusiness(books, business).getProfitAndLoss(range)
    );

    expect(String(unnamed)).toContain("BUSINESS_REQUIRED");
  });
});
