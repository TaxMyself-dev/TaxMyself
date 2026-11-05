import { assert, describe, it } from "@effect/vitest";
import { asSchema } from "ai";
import { Effect, Exit } from "effect";

import type {
  ExpenseQuery,
  ExpenseQueryAnswer,
} from "../../../../../src/agent/core/ports/keepintax-ports";
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
  evalCeramicsBusiness,
  evalDesignerBusiness,
  evalDesignerExpenses,
  evalTwoBusinessExpenses,
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

// One business's answer, or several's, as the test expects it.
const oneBusiness = (answer: ExpenseQueryAnswer) => {
  if (answer.scope !== "business") {
    throw new TypeError("expected one business");
  }

  return answer;
};

const severalBusinesses = (answer: ExpenseQueryAnswer) => {
  if (answer.scope !== "businesses") {
    throw new TypeError("expected several businesses");
  }

  return answer;
};

const twoBusinesses = {
  businesses: [evalDesignerBusiness, evalCeramicsBusiness],
};

// What the model may send, valid or not.
type SentInput = Record<string, string | boolean | readonly string[]>;

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
    assert.isTrue(
      await validInput({
        ...thisYear,
        businessNumbers: ["514789632", "039876541"],
      })
    );
    assert.isTrue(await validInput({ ...thisYear, allBusinesses: true }));
    assert.isFalse(
      await validInput({ ...thisYear, businessNumbers: ["514789632"] })
    );
    assert.isFalse(
      await validInput({
        ...thisYear,
        businessNumbers: ["514789632", "1; drop"],
      })
    );
  });

  it.effect("answers from the books: approved totals, pending apart", () =>
    Effect.gen(function* answersFromBooks() {
      const { books, queries } = evalBooks(evalDesignerExpenses);
      const query: ExpenseQuery = { ...thisYear, search: "דלק" };

      const result = oneBusiness(yield* books.queryExpenses(query));

      assert.deepStrictEqual(queries, [query]);
      assert.strictEqual(result.totals.sum, 1662);
      assert.strictEqual(result.totals.count, 4);
      assert.strictEqual(result.pending.count, 1);
      assert.deepStrictEqual(result.matchedClassifications, ["רכב / דלק"]);
      assert.strictEqual(result.rowsOmitted, 0);
    })
  );

  it.effect(
    "adds two businesses' subtotals into an exact combined total, pending and private apart",
    () =>
      Effect.gen(function* combinesBusinesses() {
        const { books } = evalBooks(evalTwoBusinessExpenses, twoBusinesses);

        const both = severalBusinesses(
          yield* books.queryExpenses({
            ...thisYear,
            search: "דלק",
            allBusinesses: true,
          })
        );

        assert.deepStrictEqual(
          both.businesses.map((one) => [one.business.number, one.totals.sum]),
          [
            ["514789632", 1662],
            ["039876541", 431.15],
          ]
        );
        assert.isTrue(both.complete);
        assert.strictEqual(both.combined?.totals.sum, 2093.15);
        assert.strictEqual(both.combined?.pending.count, 2);
        assert.strictEqual(both.combined?.excluded.count, 1);

        // The whole year: the workshop's private groceries stay apart.
        const all = severalBusinesses(
          yield* books.queryExpenses({ ...thisYear, allBusinesses: true })
        );

        assert.strictEqual(all.combined?.approvedOutsideBooks.sum, 412.3);
      })
  );

  it.effect(
    "with several businesses: the active one by default, a question for one when none is active",
    () =>
      Effect.gen(function* activeBusiness() {
        const active = evalBooks(evalTwoBusinessExpenses, {
          ...twoBusinesses,
          active: evalCeramicsBusiness.number,
        });

        const inActive = oneBusiness(
          yield* active.books.queryExpenses({ ...thisYear, search: "דלק" })
        );

        assert.strictEqual(inActive.business.number, "039876541");
        assert.strictEqual(inActive.totals.sum, 431.15);

        const none = evalBooks(evalTwoBusinessExpenses, twoBusinesses);

        const asked = yield* Effect.exit(
          none.books.queryExpenses({ ...thisYear, search: "דלק" })
        );

        assert.include(String(asked), "BUSINESS_REQUIRED");
      })
  );

  it.effect(
    "gives no combined total when a business fails, and refuses a foreign business",
    () =>
      Effect.gen(function* partialAndForeign() {
        const { books } = evalBooks(evalTwoBusinessExpenses, {
          ...twoBusinesses,
          failing: [evalCeramicsBusiness.number],
        });

        const partial = severalBusinesses(
          yield* books.queryExpenses({ ...thisYear, allBusinesses: true })
        );

        assert.isFalse(partial.complete);
        assert.isNull(partial.combined);
        assert.deepStrictEqual(
          partial.failed.map((one) => [one.business.number, one.code]),
          [["039876541", "BOOKS_UNAVAILABLE"]]
        );

        const foreign = yield* Effect.exit(
          books.queryExpenses({
            ...thisYear,
            businessNumbers: ["514789632", "999999999"],
          })
        );

        assert.include(String(foreign), "BUSINESS_NOT_FOUND");
      })
  );

  it.effect(
    "a revoked delegation mid-answer reaches the model with its code and a next step to stop",
    () =>
      Effect.gen(function* revokedMidAnswer() {
        const exit = yield* queryInRequest(
          failingDomain(
            new Error(
              "ACCESS_REVOKED: the access to this client's data was revoked"
            )
          ),
          thisYear
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.include(String(exit), "ACCESS_REVOKED: ");
        assert.include(
          agentSourceErrorText("ACCESS_REVOKED: revoked"),
          "use nothing this chat read before"
        );
      })
  );

  it.effect("reads the domain the Nest backend gave the request", () =>
    Effect.gen(function* readsDomain() {
      const exit = yield* queryInRequest(evalDomain(), {
        ...thisYear,
        groupBy: "category",
      });

      assert.isTrue(Exit.isSuccess(exit));

      const largest = Exit.isSuccess(exit)
        ? oneBusiness(exit.value).groups[0]
        : undefined;

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
      "ACCESS_REVOKED",
      "BOOKS_UNAVAILABLE",
      "BUSINESS_NOT_FOUND",
      "BUSINESS_REQUIRED",
      "EXPENSE_RANGE_INVALID",
      "EXPENSE_SCOPE_INVALID",
    ]) {
      assert.include(agentSourceErrorText(`${code}: detail`), "Next step:");
    }
  });
});
