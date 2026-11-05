import { assert, describe, it } from "@effect/vitest";
import { asSchema } from "ai";
import { Effect, Exit } from "effect";

import type { ExpenseQuery } from "../../../../../src/agent/core/ports/keepintax-ports";
import { agentSourceErrorText } from "../../../../../src/agent/core/tool-runtime/agent-tool-error-next-step";
import {
  agentToolLeavesNoTrace,
  agentToolNeedsApproval,
} from "../../../../../src/agent/core/tool-runtime/agent-tool-traits";
import { queryExpensesTool } from "../../../../../src/agent/tools/books/query-expenses-tool";
import { createKeepInTaxBooks } from "../../../../../src/server/agent-ports.server";
import type { AgentDomain } from "../../../../../src/server/runtime/agent-domain";
import { runInAgentRequest } from "../../../../../src/server/runtime/agent-request-context";
import {
  evalBooks,
  evalDesignerExpenses,
} from "../../../../evals/agent/harness/agent-eval-books";

// queryExpenses reads the user's expenses through KeepInTaxBooks: a read
// that changes nothing, its input checked before it runs, and its port the
// domain the Nest backend gave the request, its failures keeping their code.

const user = {
  actorFirebaseId: "owner-1",
  firebaseId: "owner-1",
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: false,
  isAdminImpersonation: false,
};

const request = new Request("http://localhost/api/agent/chat");

const thisYear: ExpenseQuery = { from: "2026-01-01", to: "2026-10-04" };

// What the model may send, valid or not.
type SentInput = Record<string, string | boolean>;

const validInput = async (input: SentInput) => {
  const result = await asSchema(queryExpensesTool.inputSchema).validate?.(
    input
  );

  return result?.success;
};

// The books' answer as the Nest backend gives it, for one query.
const evalDomain = (): AgentDomain => {
  const { books } = evalBooks(evalDesignerExpenses);

  return {
    queryExpenses: async (query) =>
      await Effect.runPromise(books.queryExpenses(query)),
  };
};

// A domain whose every query fails with the error.
const failingDomain = (failure: Error): AgentDomain => ({
  queryExpenses: async () => await Promise.reject(failure),
});

// A query through createKeepInTaxBooks, inside a request given the domain.
const queryInRequest = (domain: AgentDomain, query: ExpenseQuery) =>
  Effect.promise(
    async () =>
      await runInAgentRequest(
        request,
        user,
        async () =>
          await Effect.runPromiseExit(
            createKeepInTaxBooks().queryExpenses(query)
          ),
        domain
      )
  );

describe("queryExpenses", () => {
  it("is a read: no approval card, and an answer that used it may be tried again", () => {
    assert.isFalse(agentToolNeedsApproval("queryExpenses"));
    assert.isTrue(agentToolLeavesNoTrace("queryExpenses"));
  });

  it("takes a range of real dates and the known groupings only", async () => {
    assert.isTrue(await validInput({ ...thisYear }));
    assert.isTrue(
      await validInput({
        ...thisYear,
        search: "דלק",
        groupBy: "month",
        includeRows: true,
      })
    );
    assert.isFalse(await validInput({ from: "01/01/2026", to: "2026-10-04" }));
    assert.isFalse(await validInput({ from: "2026-13-01", to: "2026-10-04" }));
    assert.isFalse(await validInput({ ...thisYear, groupBy: "day" }));
    assert.isFalse(
      await validInput({ ...thisYear, businessNumber: "x; drop table" })
    );
  });

  it.effect("answers from the books: approved totals, pending apart", () =>
    Effect.gen(function* answersFromBooks() {
      const { books, queries } = evalBooks(evalDesignerExpenses);
      const query: ExpenseQuery = { ...thisYear, search: "דלק" };

      const result = yield* books.queryExpenses(query);

      assert.deepStrictEqual(queries, [query]);
      assert.strictEqual(result.totals.sum, 1662);
      assert.strictEqual(result.totals.count, 4);
      assert.strictEqual(result.pending.count, 1);
    })
  );

  it.effect("reads the domain the Nest backend gave the request", () =>
    Effect.gen(function* readsDomain() {
      const exit = yield* queryInRequest(evalDomain(), {
        ...thisYear,
        groupBy: "category",
      });

      assert.isTrue(Exit.isSuccess(exit));

      const largest = Exit.isSuccess(exit) ? exit.value.groups[0] : undefined;

      assert.strictEqual(largest?.key, "שירותים מקצועיים");
      assert.strictEqual(largest?.sum, 3540);
    })
  );

  it.effect(
    "keeps a domain failure's code, and makes any other one BOOKS_UNAVAILABLE",
    () =>
      Effect.gen(function* failureCodes() {
        const coded = yield* queryInRequest(
          failingDomain(
            new Error(
              "BUSINESS_REQUIRED: the user has 2 businesses: 1 (a), 2 (b)"
            )
          ),
          thisYear
        );

        const other = yield* queryInRequest(
          failingDomain(new Error("connect ECONNREFUSED")),
          thisYear
        );

        assert.isTrue(Exit.isFailure(coded));
        assert.include(
          String(coded),
          "BUSINESS_REQUIRED: the user has 2 businesses"
        );
        assert.include(
          String(other),
          "BOOKS_UNAVAILABLE: connect ECONNREFUSED"
        );
      })
  );

  it.effect(
    "fails as unavailable outside a request from the Nest backend",
    () =>
      Effect.gen(function* noDomain() {
        const exit = yield* Effect.exit(
          createKeepInTaxBooks().queryExpenses(thisYear)
        );

        assert.include(String(exit), "BOOKS_UNAVAILABLE");
      })
  );

  it("gives the model a next step for each failure code", () => {
    for (const code of [
      "BOOKS_UNAVAILABLE",
      "BUSINESS_NOT_FOUND",
      "BUSINESS_REQUIRED",
      "EXPENSE_RANGE_INVALID",
    ]) {
      assert.include(agentSourceErrorText(`${code}: detail`), "Next step:");
    }
  });
});
