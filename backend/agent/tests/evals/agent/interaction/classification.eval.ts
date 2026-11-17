import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { KeepInTaxBooks } from "@/agent/core/ports/keepintax-ports";

import { evalBooks, evalDesignerBusiness } from "../harness/agent-eval-books";
import { evalConversationId } from "../harness/agent-eval-fixtures";
import {
  runAgentEvalStep,
  startAgentEvalConversation,
} from "../harness/agent-eval-harness";
import type { AgentEvalScenario } from "../harness/agent-eval-scenario";
import { emptyEvalSettings } from "../harness/agent-eval-settings-fixtures";

const fixture = (ambiguous = false) => {
  const business = evalDesignerBusiness;
  let applied = 0;

  const rows = [
    {
      id: 101,
      externalTransactionId: "adobe-101",
      date: "2026-09-12",
      merchant: "Adobe",
      account: "כרטיס עסקי",
      amount: -118,
      currency: "ILS",
      originalAmount: null,
      category: null,
      subCategory: null,
      state: "unclassified" as const,
    },
  ];

  if (ambiguous) {
    rows.push({
      ...rows[0],
      id: 102,
      externalTransactionId: "adobe-102",
      date: "2026-09-14",
    });
  }

  const proposal = JSON.stringify({
    payload: JSON.stringify({
      display: {
        businessNumber: business.number,
        businessName: business.name,
        date: rows[0].date,
        merchant: "Adobe",
        amount: -118,
        currency: "ILS",
        category: "משרד",
        subCategory: "תוכנה",
        vatPercent: 100,
        taxPercent: 100,
      },
    }),
    signature: "eval",
  });

  const books: KeepInTaxBooks = {
    ...evalBooks([], { businesses: [business] }).books,
    queryTransactions: (query) =>
      Effect.succeed({
        business,
        otherBusinesses: [],
        from: query.from,
        to: query.to,
        filters: {
          direction: "out",
          search: null,
          account: null,
          state: "unclassified",
        },
        bankData: {
          syncRecorded: true,
          syncStatus: "completed",
          lastSyncResult: "success",
          lastSyncFinishedAt: "2026-10-04T09:00:00Z",
          lastSyncSkipReason: null,
          lastSyncSucceeded: true,
        },
        moneyIn: { count: 0, sum: 0 },
        moneyOut: { count: rows.length, sum: 118 * rows.length },
        byState: { unclassified: rows.length, classified: 0, confirmed: 0 },
        groups: [],
        groupsOmitted: null,
        rows,
        rowsOmitted: 0,
        notConverted: { count: 0 },
        notLinkedToBusiness: { count: 0 },
        accountsInRange: [],
        complete: true,
      }),
    listCategories: () =>
      Effect.succeed({
        business,
        categories: [
          {
            name: "משרד",
            subCategories: [
              {
                id: 7,
                name: "תוכנה",
                owner: "system",
                private: false,
                status: "ready",
                accountName: "תוכנה",
                sectionName: "הוצאות הנהלה",
                vatPercent: 100,
                taxPercent: 100,
              },
            ],
          },
        ],
        subCategoryCount: 1,
        omitted: 0,
      }),
    prepareTransactionClassification: (query) =>
      query.externalTransactionId === "adobe-101" && query.subCategoryId === 7
        ? Effect.succeed({ proposal })
        : Effect.die(new Error("Wrong transaction/category")),
    classifyTransaction: (query) =>
      Effect.sync(() => {
        expect(query.proposal).toBe(proposal);
        applied += 1;

        return {
          status: "classified" as const,
          expenseApproved: false as const,
          category: "משרד",
          subCategory: "תוכנה",
        };
      }),
  };

  const scenario: AgentEvalScenario = {
    data: {
      agent_chat_messages: [
        {
          role: "assistant",
          conversation_id: evalConversationId,
          parts: [
            {
              type: "tool-prepareTransactionClassification",
              state: "output-available",
              output: {
                proposalId: "eval",
                proposal,
              },
            },
          ],
        },
      ],
    },
    books,
    locale: "he",
    settings: emptyEvalSettings,
  };

  return { scenario, applied: () => applied };
};

const request =
  "סווג באופן חד פעמי את החיוב של Adobe מ־12 בספטמבר 2026 בסך 118 ש״ח כהוצאות תוכנה בסטודיו נועה. אל תאשר אותו כהוצאה.";

describe("Phase A classification", () => {
  it("clear request waits for approval, then executes the exact proposal", async () => {
    const f = fixture();

    const first = await runAgentEvalStep(
      f.scenario,
      { message: request },
      startAgentEvalConversation(f.scenario)
    );

    expect(first.run.approvals).toContain("classifyTransaction");
    expect(f.applied()).toBe(0);

    const card = first.run.approvalRequests.find(
      (requestCard) => requestCard.toolName === "classifyTransaction"
    );

    expect(card).toBeDefined();

    if (!card) {
      throw new Error("Missing approval card");
    }

    const done = await runAgentEvalStep(
      f.scenario,
      { decisions: [{ approvalId: card.approvalId, approved: true }] },
      first.conversation
    );

    expect(f.applied()).toBe(1);
    expect(done.run.answer.length).toBeGreaterThan(0);
  });
  it("denial executes nothing", async () => {
    const f = fixture();

    const first = await runAgentEvalStep(
      f.scenario,
      { message: request },
      startAgentEvalConversation(f.scenario)
    );

    const card = first.run.approvalRequests.find(
      (requestCard) => requestCard.toolName === "classifyTransaction"
    );

    expect(card).toBeDefined();

    if (!card) {
      throw new Error("Missing approval card");
    }

    await runAgentEvalStep(
      f.scenario,
      { decisions: [{ approvalId: card.approvalId, approved: false }] },
      first.conversation
    );
    expect(f.applied()).toBe(0);
  });
  it("ambiguous transaction asks instead of preparing a write", async () => {
    const f = fixture(true);

    const first = await runAgentEvalStep(
      f.scenario,
      {
        message:
          "סווג את החיוב של Adobe בספטמבר 2026 להוצאות תוכנה בסטודיו נועה",
      },
      startAgentEvalConversation(f.scenario)
    );

    expect(first.run.question).not.toBeNull();
    expect(first.run.approvals).toHaveLength(0);
    expect(f.applied()).toBe(0);
    expect(
      first.run.toolCalls.some(
        (call) => call.name === "prepareTransactionClassification"
      )
    ).toBe(false);
  });
  it("continues a transaction listing with a classification card", async () => {
    const f = fixture();

    const first = await runAgentEvalStep(
      f.scenario,
      { message: "הצג תנועות לא מסווגות בספטמבר 2026 בסטודיו נועה" },
      startAgentEvalConversation(f.scenario)
    );

    expect(first.run.approvals).toHaveLength(0);
    expect(f.applied()).toBe(0);

    const next = await runAgentEvalStep(
      f.scenario,
      { message: "סווג את תנועת Adobe שהצגת כהוצאות תוכנה, באופן חד פעמי" },
      first.conversation
    );

    expect(next.run.approvals).toContain("classifyTransaction");
    expect(f.applied()).toBe(0);
  });
});
