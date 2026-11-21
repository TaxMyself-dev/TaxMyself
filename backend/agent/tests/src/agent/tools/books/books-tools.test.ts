import { assert, describe, it } from "@effect/vitest";
import { asSchema } from "ai";
import { Effect, Exit } from "effect";

import { withConversationBusiness } from "@/agent/tools/books/agent-conversation-business";

import type { KeepInTaxBooks } from "../../../../../src/agent/core/ports/keepintax-ports";
import { keepInTaxBooksReads } from "../../../../../src/agent/core/ports/keepintax-ports";
import { agentSourceErrorText } from "../../../../../src/agent/core/tool-runtime/agent-tool-error-next-step";
import { agentToolNamespaceName } from "../../../../../src/agent/core/tool-runtime/agent-tool-search";
import {
  agentToolLeavesNoTrace,
  agentToolNeedsApproval,
  agentToolReturnsBookNumbers,
  agentToolRunsAlone,
} from "../../../../../src/agent/core/tool-runtime/agent-tool-traits";
import { appAgentTools } from "../../../../../src/agent/core/tool-runtime/app-agent-tools";
import { createKeepInTaxBooks } from "../../../../../src/server/agent-ports.server";
import type { AgentDomain } from "../../../../../src/server/runtime/agent-domain";
import { runInAgentRequest } from "../../../../../src/server/runtime/agent-request-context";
import {
  evalAgentDomain,
  evalBooks,
  evalCeramicsBusiness,
  evalDesignerBusiness,
  evalTwoBusinessExpenses,
  failingAgentDomain,
} from "../../../../evals/agent/harness/agent-eval-books";

// The Phase 3 books and reports tools: reads that change nothing, each over
// one KeepInTaxBooks read, their input checked before they run, loaded
// through tool search (namespaces "books" and "reports"), and their port the
// domain the Nest backend gave the request.

const newReads = keepInTaxBooksReads.filter((name) => name !== "queryExpenses");

const reportReads = new Set([
  "getProfitAndLoss",
  "getVatSummary",
  "getAdvanceTaxStatus",
  "listUpcomingReports",
  "getReportReadiness",
]);

const user = {
  actorFirebaseId: "accountant-1",
  firebaseId: "client-1",
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: true,
  isAdminImpersonation: false,
};

const request = new Request("http://localhost/api/agent/chat");

// The conversation established the studio (2026-11-15, business
// selection): the production wrapper fills it in, as the chat does; the
// fakes have no page default.
const studioState = () => ({
  directory: [evalDesignerBusiness, evalCeramicsBusiness],
  current: evalDesignerBusiness.number,
  readByNumber: new Set<string>(),
});

const inStudio = (books: KeepInTaxBooks) =>
  withConversationBusiness(books, studioState());

const studioBooks = (run: ReturnType<typeof evalBooks>) => ({
  ...run,
  books: inStudio(run.books),
});

const both = {
  businesses: [evalDesignerBusiness, evalCeramicsBusiness],
};

const january = { from: "2026-01-01", to: "2026-01-31" };
const firstHalf = { from: "2026-01-01", to: "2026-06-30" };

// What the model may send, valid or not.
type SentInput = Record<string, string | boolean>;

const valid = async (name: (typeof newReads)[number], input: SentInput) => {
  const result = await asSchema(appAgentTools[name].inputSchema).validate?.(
    input
  );

  return result?.success;
};

const inRequest = <A>(
  domain: AgentDomain,
  read: () => Effect.Effect<A, Error>
) =>
  Effect.promise(
    async () =>
      await runInAgentRequest(
        request,
        user,
        async () => await Effect.runPromiseExit(read()),
        domain
      )
  );

// Every new read once, through the books port.
const everyNewRead: readonly ((
  books: KeepInTaxBooks
) => Effect.Effect<object, Error>)[] = [
  (books) => books.queryTransactions(january),
  (books) => books.queryIssuedDocuments(january),
  (books) => books.listCategories({}),
  (books) => books.listClients({}),
  (books) => books.getProfitAndLoss(january),
  (books) => books.getVatSummary(january),
  (books) => books.getAdvanceTaxStatus(january),
  (books) => books.listUpcomingReports({}),
  (books) => books.getReportReadiness(january),
];

describe("the books and reports tools", () => {
  it("are reads: no approval card, run side by side, may be tried again, and their answers are number-checked", () => {
    for (const name of newReads) {
      assert.isFalse(agentToolNeedsApproval(name), name);
      assert.isTrue(agentToolLeavesNoTrace(name), name);
      assert.isFalse(agentToolRunsAlone(name), name);
      assert.isTrue(agentToolReturnsBookNumbers(name), name);
    }

    assert.isTrue(agentToolReturnsBookNumbers("queryExpenses"));
    assert.isFalse(agentToolReturnsBookNumbers("listTrackingTasks"));
  });

  it("load through tool search (books, reports); queryExpenses stays loaded", () => {
    for (const name of newReads) {
      assert.strictEqual(
        agentToolNamespaceName(name),
        reportReads.has(name) ? "reports" : "books",
        name
      );
    }

    assert.isUndefined(agentToolNamespaceName("queryExpenses"));
  });

  it("take real dates, known values and the user's business numbers only", async () => {
    const range = { from: "2026-01-01", to: "2026-10-04" };

    const rangeReads = [
      "getProfitAndLoss",
      "getVatSummary",
      "getAdvanceTaxStatus",
      "getReportReadiness",
    ] as const;

    const results = await Promise.all([
      valid("queryTransactions", {
        ...range,
        direction: "out",
        state: "unclassified",
        groupBy: "merchant",
        includeRows: true,
      }),
      valid("queryIssuedDocuments", {
        ...range,
        docType: "CREDIT_INVOICE",
        client: "אלפא",
      }),
      valid("listCategories", { search: "דלק" }),
      valid("listUpcomingReports", { includeReported: true }),
      ...rangeReads.map(async (name) => await valid(name, range)),
    ]);

    const refused = await Promise.all([
      valid("queryTransactions", { ...range, direction: "sideways" }),
      valid("queryTransactions", { from: "01/01/2026", to: "2026-10-04" }),
      valid("queryIssuedDocuments", { ...range, docType: "INVOICE" }),
      valid("listClients", { businessNumber: "1; drop" }),
      ...rangeReads.map(
        async (name) => await valid(name, { ...range, to: "2026-13-01" })
      ),
    ]);

    assert.isTrue(results.every((success) => success === true));
    assert.isTrue(refused.every((success) => success === false));
  });

  it.effect(
    "each tool reads its own port, as the backend's domain answers",
    () =>
      Effect.gen(function* eachReadsItsPort() {
        const domain = evalAgentDomain(evalTwoBusinessExpenses, both);

        const vat = yield* inRequest(domain, () =>
          inStudio(createKeepInTaxBooks()).getVatSummary({
            from: "2026-01-01",
            to: "2026-02-28",
          })
        );

        const clients = yield* inRequest(domain, () =>
          inStudio(createKeepInTaxBooks()).listClients({})
        );

        assert.deepStrictEqual(
          Exit.isSuccess(vat) ? vat.value.range?.periods : null,
          ["1-2/2026"]
        );
        assert.deepStrictEqual(
          Exit.isSuccess(vat) ? { toPay: vat.value.vatToPay } : null,
          { toPay: 770.8 }
        );
        assert.strictEqual(
          Exit.isSuccess(clients) ? clients.value.total : null,
          4
        );
      })
  );

  it.effect(
    "a revoked delegation mid-answer reaches the model with ACCESS_REVOKED on every read",
    () =>
      Effect.gen(function* revoked() {
        const domain = failingAgentDomain(
          new Error(
            "ACCESS_REVOKED: the access to this client's data was revoked"
          )
        );

        const exits: Exit.Exit<object, Error>[] = [];

        for (const read of everyNewRead) {
          exits.push(
            yield* inRequest(domain, () => read(createKeepInTaxBooks()))
          );
        }

        assert.lengthOf(exits, newReads.length);

        for (const exit of exits) {
          assert.include(String(exit), "ACCESS_REVOKED: ");
        }

        const other = yield* inRequest(
          failingAgentDomain(new Error("socket hang up")),
          () => inStudio(createKeepInTaxBooks()).getProfitAndLoss(january)
        );

        assert.include(String(other), "BOOKS_UNAVAILABLE: socket hang up");
      })
  );

  it("gives the model a next step for the new failure codes", () => {
    for (const code of [
      "RANGE_INVALID",
      "MODULE_NOT_INCLUDED",
      "ACCESS_REVOKED",
    ]) {
      assert.include(agentSourceErrorText(`${code}: detail`), "Next step:");
    }
  });
});

describe("the evals' report reads (fake ports)", () => {
  it.effect(
    "VAT: a month widens to its bi-monthly period, across a year boundary too",
    () =>
      Effect.gen(function* vatPeriods() {
        const { books, reads } = studioBooks(
          evalBooks(evalTwoBusinessExpenses, both)
        );

        const firstPeriod = yield* books.getVatSummary(january);

        assert.deepStrictEqual(firstPeriod.range, {
          requested: january,
          from: "2026-01-01",
          to: "2026-02-28",
          rangeExpanded: true,
          periods: ["1-2/2026"],
        });
        assert.strictEqual(firstPeriod.vatToPay, 770.8);
        assert.isTrue(firstPeriod.markedReported);

        const yearEnd = yield* books.getVatSummary({
          from: "2025-12-01",
          to: "2026-01-31",
        });

        assert.deepStrictEqual(yearEnd.range?.periods, [
          "11-12/2025",
          "1-2/2026",
        ]);
        assert.strictEqual(yearEnd.vatToPay, 1279.29);
        assert.isNull(yearEnd.markedReported);

        const exempt = yield* books.getVatSummary({
          ...january,
          businessNumber: evalCeramicsBusiness.number,
        });

        assert.isFalse(exempt.applies);
        assert.isNull(exempt.vatToPay);
        assert.deepStrictEqual(
          reads.map((read) => read.name),
          ["getVatSummary", "getVatSummary", "getVatSummary"]
        );
      })
  );

  it.effect(
    "transactions: exact sums, the unlinked and unconverted apart, partial when the sync was",
    () =>
      Effect.gen(function* transactions() {
        const thisYear = { from: "2026-01-01", to: "2026-10-04" };
        const { books } = studioBooks(evalBooks(evalTwoBusinessExpenses, both));

        const all = yield* books.queryTransactions(thisYear);

        assert.deepStrictEqual(all.moneyIn, { count: 3, sum: 12_980 });
        assert.deepStrictEqual(all.moneyOut, { count: 5, sum: 2561.86 });
        assert.deepStrictEqual(all.notConverted, { count: 1 });
        assert.deepStrictEqual(all.notLinkedToBusiness, { count: 1 });
        assert.isFalse(all.complete);

        const partial = studioBooks(
          evalBooks(evalTwoBusinessExpenses, { ...both, bankSync: "partial" })
        );

        const fuel = yield* partial.books.queryTransactions({
          ...thisYear,
          search: "דלק",
        });

        assert.isFalse(fuel.bankData.lastSyncSucceeded);
        assert.isFalse(fuel.complete);

        // A successful sync, every row in ₪, only an unlinked row left out
        // (July's electricity bill): still not complete.
        const july = yield* books.queryTransactions({
          from: "2026-07-01",
          to: "2026-07-31",
        });

        assert.isTrue(july.bankData.lastSyncSucceeded);
        assert.deepStrictEqual(july.notConverted, { count: 0 });
        assert.deepStrictEqual(july.notLinkedToBusiness, { count: 1 });
        assert.isFalse(july.complete);
      })
  );

  it.effect(
    "issued documents: per type, the cancelled and drafts apart, clients listed when none matched",
    () =>
      Effect.gen(function* documents() {
        const { books } = studioBooks(evalBooks(evalTwoBusinessExpenses, both));

        const september = yield* books.queryIssuedDocuments({
          from: "2026-09-01",
          to: "2026-10-04",
        });

        assert.deepStrictEqual(
          september.byType.map((one) => [
            one.docType,
            one.count,
            one.totalWithVat,
          ]),
          [
            ["CREDIT_INVOICE", 1, 590],
            ["PRICE_QUOTE", 1, 11_800],
            ["TAX_INVOICE", 1, 4720],
          ]
        );
        assert.deepStrictEqual(september.cancelled, { count: 1 });
        assert.deepStrictEqual(september.notIssued, { count: 1 });

        const nobody = yield* books.queryIssuedDocuments({
          from: "2026-01-01",
          to: "2026-10-04",
          client: "אומגה",
        });

        assert.deepStrictEqual(nobody.byType, []);
        assert.include(nobody.clientsInRange, "בטא שיווק");

        // August: one invoice in shekels, dollars and euros, each totalled
        // in its own currency, never added together or called shekels.
        const august = yield* books.queryIssuedDocuments({
          from: "2026-08-01",
          to: "2026-08-31",
        });

        assert.deepStrictEqual(
          august.byType.map((one) => [
            one.docType,
            one.currency,
            one.totalWithVat,
          ]),
          [
            ["TAX_INVOICE", "EUR", 2000],
            ["TAX_INVOICE", "ILS", 1180],
            ["TAX_INVOICE", "USD", 1000],
          ]
        );
        // Three invoices of every currency: a count the answer may give.
        assert.strictEqual(august.count, 3);
      })
  );

  it.effect(
    "upcoming reports: the overdue VAT report, the reported ones left out",
    () =>
      Effect.gen(function* upcoming() {
        const { books } = studioBooks(evalBooks(evalTwoBusinessExpenses, both));

        const studio = yield* books.listUpcomingReports({
          businessNumber: evalDesignerBusiness.number,
        });

        assert.deepStrictEqual(
          studio.businesses[0]?.obligations.map((one) => [
            one.type,
            one.period,
            one.state,
          ]),
          [
            ["VAT", "7-8/2026", "overdue"],
            ["ADVANCE_TAX", "9/2026", "due"],
            ["ADVANCE_TAX", "10/2026", "open"],
            ["VAT", "9-10/2026", "open"],
          ]
        );
        assert.strictEqual(studio.reportedOmitted, 2);

        // Every business listed, the active one named; none when none is.
        const all = yield* books.listUpcomingReports({});

        assert.lengthOf(all.businesses, 2);
        assert.strictEqual(
          all.activeBusiness?.number,
          evalDesignerBusiness.number
        );

        const noActive = evalBooks(evalTwoBusinessExpenses, {
          businesses: both.businesses,
        });

        const unknown = yield* noActive.books.listUpcomingReports({});

        assert.isNull(unknown.activeBusiness);
      })
  );

  it.effect(
    "a revoked delegation fails every report read; a failing read names its code",
    () =>
      Effect.gen(function* failures() {
        const revoked = evalBooks(evalTwoBusinessExpenses, {
          ...both,
          revoked: true,
        });

        const exit = yield* Effect.exit(
          revoked.books.getProfitAndLoss(firstHalf)
        );

        assert.include(String(exit), "ACCESS_REVOKED");

        const failing = evalBooks(evalTwoBusinessExpenses, {
          ...both,
          failingReads: ["getReportReadiness"],
        });

        const down = yield* Effect.exit(
          failing.books.getReportReadiness({
            from: "2026-09-01",
            to: "2026-10-31",
          })
        );

        assert.include(String(down), "BOOKS_UNAVAILABLE");

        const none = evalBooks(evalTwoBusinessExpenses, {
          businesses: both.businesses,
        });

        const asked = yield* Effect.exit(
          none.books.getProfitAndLoss(firstHalf)
        );

        assert.include(String(asked), "BUSINESS_REQUIRED");
      })
  );
});
