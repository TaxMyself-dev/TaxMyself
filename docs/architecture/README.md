# Architecture diagrams

Visual maps of the three core pipelines (Feezback sync → classification → report) and the database schema behind them.

Each diagram comes in two forms:

- **`.mmd`** — Mermaid source. Edit this when the flow changes; re-render with the command at the bottom of this file.
- **`.png`** — Rendered image. Open in any image viewer; embedded below for at-a-glance browsing.

GitHub also renders the `.mmd` files inline as live SVG when you click them, and the embedded code blocks below render in any Markdown viewer that supports Mermaid (VS Code's preview, JetBrains, etc.).

---

## 1. Feezback Sync Flow

How transactions go from the bank/card aggregator into the local DB, with auto-classification baked in.

![Sync flow](./01-sync-flow.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart TB
    T1[Auth signin<br/>triggerPostLoginSync]
    T2[Manual button<br/>POST /transactions/trigger-sync]
    T3[Feezback consent webhook<br/>UserDataIsAvailable]

    T1 --> FS
    T2 --> FS
    T3 --> FS

    FS[FeezbackService.triggerFullSync<br/>userId, source]
    FS --> Lock[UserSyncState set running<br/>fullProcessStatus + perSourceStatus]

    Lock --> Banks[Fetch banks per source<br/>Feezback REST]
    Lock --> Cards[Fetch cards per source<br/>Feezback REST]

    Banks --> Norm
    Cards --> Norm
    Norm[normalizeBank/CardTransactions<br/>NormalizedTransaction list]

    Norm --> Dedup[In-memory dedup per source<br/>by aspspOriginalId<br/>keep newest referenceTime]
    Dedup --> Process[TransactionProcessingService.process<br/>per-tx STEP routing]

    Process --> S0
    Process --> S1
    Process --> S2
    Process --> S3

    S0[STEP 0: tx.billId is null<br/>cache only<br/>buildCacheRow]
    S1[STEP 1: slim row exists<br/>overlay slim onto cache<br/>buildCacheRowWithSlim]
    S2[STEP 2: no slim and rule matches<br/>INSERT slim with classificationType=RULE<br/>buildCacheRowWithRule]
    S3[STEP 3: no slim, no rule match<br/>cache only<br/>buildCacheRow]

    S0 --> Cache
    S1 --> Cache
    S2 --> Slim
    S2 --> Cache
    S3 --> Cache

    Slim[Bulk INSERT/UPSERT<br/>slim_transactions]
    Cache[Bulk UPSERT<br/>full_transactions_cache<br/>UNIQUE userId, externalTransactionId]

    Slim --> Done
    Cache --> Done

    Done[UserSyncState set completed<br/>+ perSourceStatus + rowsWritten]
```

</details>

**Key invariants:**
- Cache rows are written for **every** transaction (steps 0–3). Cache is the raw ledger.
- Slim rows are only written/touched in steps 1 and 2.
- STEP 1's existence check is the **short-circuit** that protects past classifications from rule edits / re-resolution on every sync.
- `matchRule` is deterministic (specificity score + newest-`updatedAt` tie-breaker), so STEP 2 is reproducible.

---

## 2. User-Initiated Classification Flow

Two entry methods (ONE_TIME vs RULE) from the classify dialog, focused on the user-reachable paths.

![Classification flow](./02-classification-flow.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart TB
    Pre[/"Precondition: row is visible in the transactions table<br/>(cache row exists)<br/>AND already linked to a bill<br/>(if not, user must use 'שייך לחשבון' first)"/]
    Pre --> User([User clicks 'סווג תנועה'<br/>on the row → classify dialog opens])
    User --> Mode{isSingleUpdate<br/>checkbox<br/>'מפה התנועה באופן חד פעמי'}

    Mode -->|true: ONE_TIME| OT[classifyManually<br/>POST /transactions/classify-trans]
    Mode -->|false: RULE| RU[classifyWithRule<br/>POST /transactions/classify-trans]

    OT --> OG{slim.vatReportingDate<br/>== null?<br/>'is row in a filed report?'}
    OG -->|locked| OE[400 BadRequest<br/>blocked_vat_reported<br/>UI shows: 'transaction was VAT-reported']
    OG -->|free| OWrite

    OWrite[UPSERT slim<br/>classificationType=ONE_TIME<br/>+ category / sub / vatPercent / taxPercent /<br/>reductionPercent / isEquipment / isRecognized<br/>+ businessNumber if overridden<br/>+<br/>UPDATE cache same fields]

    RU --> RG1{slim.vatReportingDate<br/>== null?}
    RG1 -->|locked| RE1[blocked_vat_reported]
    RG1 -->|free| RG2{previously classified<br/>as ONE_TIME?<br/>and !confirmOverride}
    RG2 -->|yes, first attempt| RE2[409 confirm_override<br/>UI: 'override one-time classification?'<br/>→ user clicks Yes → re-POST with confirmOverride=true]
    RG2 -->|no, or override confirmed| RG3{rule with same signature<br/>userId+billId+merchant+constraints<br/>exists?<br/>and !confirmOverride}
    RG3 -->|yes, first attempt| RE3[409 confirm_rule_override<br/>UI: 'a rule already exists for this merchant. override?'<br/>→ user clicks Yes → re-POST with confirmOverride=true]
    RG3 -->|no, or override confirmed| RWrite

    RWrite[UPSERT classified_transactions rule<br/>+<br/>UPSERT slim<br/>classificationType=RULE<br/>classificationRuleId=savedRule.id<br/>+<br/>UPDATE cache fields<br/>+<br/>BACKFILL applyRuleToExistingTransactions<br/>same merchant + bill, in date range,<br/>SKIPS rows that are ONE_TIME or VAT-locked]
```

</details>

**Note on what's not shown:** the backend also has 404-NotFound and "no billId" guards on the API (defense-in-depth — see `classifyManually` lines 326-340 and `classifyWithRule` lines 420-434), but they're not reachable through normal UI flow:

- The user can only click "סווג תנועה" on a row that's already in the table → cache row obviously exists.
- The classify icon is hidden on rows where `billName === 'לא שוייך'` (see [transactions.page.ts:80-129](frontend/src/app/pages/transactions/transactions.page.ts#L80-L129)) → user must use the "שייך לחשבון" action to link a bill first.

**The `vatReportingDate` lock guards** at `transaction-processing.service.ts` lines **346** (manual), **442** (rule), and **950** (backfill) all check `slim.vatReportingDate != null`. They activate the moment `setReported` writes the period — see the report flow below.

---

## 3. Report Flow (Confirm → File → Lock)

End-to-end from "user has classified some transactions" through "report is filed and locked". The yellow boxes are the **planned** lock writes that need to be added to `setReported`.

![Report flow](./03-report-flow.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart TB
    A1[User opens VAT Report page<br/>picks period + business] --> A2[Click hatzeg<br/>GET /transactions/get-transaction-to-confirm-and-add-to-expenses]
    A2 --> A3{Pending<br/>expenses?}
    A3 -->|none| Empty[No confirm dialog<br/>show VAT report]
    A3 -->|N rows| Dlg[confirm-trans-dialog opens]

    Dlg --> Choice{User action}
    Choice -->|Approve and continue| B1[POST /save-trans-to-expenses<br/>saveTransactionsToExpenses]
    Choice -->|Cancel| Redirect[redirect prompt<br/>'N expenses unconfirmed'<br/>accept reopens dialog]

    B1 --> B2[For each cache row<br/>INSERT into expenses<br/>+<br/>UPSERT slim<br/>SET confirmed = true]

    B2 --> B3[GET /reports/vat-report<br/>aggregates from expenses]
    B3 --> B4[VAT report shown<br/>vatableTurnover<br/>vatRefundOnExpenses<br/>vatPayment]

    B4 --> C1[User clicks Pay at gov site<br/>opens external link]
    C1 --> C2[User files at tax authority<br/>outside the app]

    C2 --> D1[User opens task list<br/>finds the workflow card]
    D1 --> D2[PATCH /report-workflows/:id/reported<br/>setReported true]

    D2 --> D3[ReportWorkflow set<br/>status = REPORTED<br/>reportedAt = now<br/>reportedBy + source]
    D2 --> D4[AccountantTask sync<br/>isComplete = true]
    D2 --> D5[NEW planned<br/>UPDATE expenses<br/>SET isReported = true<br/>WHERE in uid, bn, period]
    D2 --> D6[NEW planned<br/>UPDATE slim_transactions s<br/>JOIN cache c USING ext id<br/>SET s.vatReportingDate = period<br/>WHERE confirmed = true<br/>AND c.transactionDate IN period]

    D6 --> Lock[Lock activated<br/>line 442 / 346 / 950 guards<br/>now block any classify edit<br/>via blocked_vat_reported]
```

</details>

---

## 4. Database Schema (ER)

How the entities relate. Slim is the classification overlay, Expense is the ledger row, ReportWorkflow is the filing artifact.

![Schema](./04-schema.png)

<details>
<summary>Mermaid source</summary>

```mermaid
erDiagram
    BUSINESS ||--o{ BILL : "businessNumber"
    BUSINESS ||--o{ REPORT_WORKFLOW : "businessNumber"
    BUSINESS ||--o{ EXPENSES : "businessNumber"
    BILL ||--o{ FULL_TRANSACTIONS_CACHE : "billId"
    FULL_TRANSACTIONS_CACHE ||--o| SLIM_TRANSACTIONS : "userId+externalTransactionId"
    FULL_TRANSACTIONS_CACHE ||--o| EXPENSES : "transId"
    SLIM_TRANSACTIONS }o--o| CLASSIFIED_TRANSACTIONS : "classificationRuleId"
    BILL ||--o{ CLASSIFIED_TRANSACTIONS : "billId"
```

</details>

**Relationship cheat sheet:**
- `cache → slim` is `1:0..1` — every transaction has a cache row; slim only exists once classified.
- `cache → expense` is `1:0..1` via `transId` — only confirmed transactions have an Expense row.
- `slim → classified_transactions` is `0..1:N` — slim's `classificationRuleId` is null for ONE_TIME.
- `business → bill / report_workflow / expenses` are `1:N` via `businessNumber` (string FK, not enforced at DB level).
- The `slim`–`expense` link is *implicit* (both have `transId`-equivalent identity); no FK between them.

---

## Re-rendering after edits

The `.mmd` files are the source of truth. After editing one, regenerate its PNG with the official Mermaid CLI via `npx` (no global install needed):

```bash
cd docs/architecture
npx -y -p @mermaid-js/mermaid-cli mmdc -i 01-sync-flow.mmd -o 01-sync-flow.png -b transparent -w 1800
npx -y -p @mermaid-js/mermaid-cli mmdc -i 02-classification-flow.mmd -o 02-classification-flow.png -b transparent -w 1800
npx -y -p @mermaid-js/mermaid-cli mmdc -i 03-report-flow.mmd -o 03-report-flow.png -b transparent -w 1800
npx -y -p @mermaid-js/mermaid-cli mmdc -i 04-schema.mmd -o 04-schema.png -b transparent -w 1800
```

`-b transparent` keeps the background see-through (works on dark-mode README too); `-w 1800` sets the render width for legibility on big diagrams. First run downloads a headless Chromium (~150 MB cached by npx, not in the repo); subsequent runs are quick.

If `mmdc` doesn't work on a given machine (no Chromium download), paste the `.mmd` content into [mermaid.live](https://mermaid.live), click Export → PNG, and overwrite the file.

## Key source files

| Concern | File |
|---|---|
| Sync entry triggers | `backend/src/transactions/transactions.controller.ts:127-161`, `backend/src/users/users.controller.ts`, `backend/src/feezback/webhook/feezback-webhook.service.ts` |
| Sync orchestration | `backend/src/feezback/feezback.service.ts` — `triggerFullSync`, `normalizeBank/CardTransactions` |
| STEP 0–3 routing | `backend/src/transactions/transaction-processing.service.ts:124-227` `process()` |
| Build helpers | `backend/src/transactions/transaction-processing.service.ts:1072-1149` (buildCacheRow / buildCacheRowWithSlim / buildCacheRowWithRule) |
| Rule matching | `backend/src/transactions/transaction-processing.service.ts:1007-1070` `matchRule` |
| Manual classify | `backend/src/transactions/transaction-processing.service.ts:321-387` `classifyManually` |
| Rule classify + backfill | `backend/src/transactions/transaction-processing.service.ts:415-562` `classifyWithRule`, `884-1000` `applyRuleToExistingTransactions` |
| Lock guards | `backend/src/transactions/transaction-processing.service.ts:346, 442, 950` — all check `slim.vatReportingDate != null` |
| Save to ledger | `backend/src/transactions/transactions.service.ts:1620-1654` `saveTransactionsToExpenses` (sets `slim.confirmed = true` + creates Expense rows) |
| VAT report calc | `backend/src/reports/reports.service.ts` — aggregates from `expenses` |
| Report workflow | `backend/src/report-workflow/report-workflow.service.ts:120-168` `setReported` (where the planned slim/expense lock writes will hook) |
| Sync state | `backend/src/transactions/user-sync-state.service.ts` — drives the polling status the UI shows |
| Period helpers | `backend/src/shared/shared.service.ts:107-145` `getVATReportingDate`, `62-81` `getStartAndEndDate` |
| Schemas | `backend/src/transactions/full-transaction-cache.entity.ts`, `backend/src/transactions/slim-transaction.entity.ts`, `backend/src/transactions/classified-transactions.entity.ts`, `backend/src/expenses/expenses.entity.ts`, `backend/src/report-workflow/report-workflow.entity.ts` |
