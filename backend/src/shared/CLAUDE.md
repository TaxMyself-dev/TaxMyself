## Purpose
Cross-cutting utilities used throughout reporting and transaction code: generic repository lookup, VAT/report-period date math, and the FX-rate (foreign currency → ILS) caching service. Distinct from the frontend `shared` directory.

## Key entities/files
- `shared.service.ts` (`SharedService`) — `findEntities`/`getRepository` (generic lookup over `Expense`/legacy `Transactions`); `getStartAndEndDate`; `getVATReportingDate`/`buildReportPeriodLabel`/`expandPeriodLabelsInRange`/`nextOpenPeriodLabels` (VAT period-label math shared by classification, reports and report-workflow); `convertStringToDateObject` (parses dd/MM/yyyy, yyyy-mm-dd, dd-mm-yyyy); `getParameters`/`getVatPercent`/`getVatRateByYear` (annual tax parameters from `annual.params.json`); `getJournalEntryCurrentIndex`/`incrementJournalEntryIndex` (sequential journal-entry numbering backed by `SettingDocuments`).
- `fx-rate.entity.ts` (`FxRate`) — persistent cache row per `(date, currency)` of the Bank of Israel exchange rate to ILS, with `effectiveDate` recording the actual published day used (for weekend/holiday fallback).
- `fx-rate.service.ts` (`FxRateService`) — three-layer cache (in-memory → `fx_rate` DB table → Bank of Israel public API, walking back up to 7 days for weekends/holidays); exposes `getRate(date, currency)` and `convertToIls(amount, currency, date)`. Has a documented known limitation: BOI's `asOf` query param is ignored upstream, so historical accuracy isn't currently guaranteed.
- `shared.module.ts` — registers `Expense`/`Transactions`/`SettingDocuments`/`FxRate` repositories; exports `SharedService` and `FxRateService`.

## Main flows
- `getRate`/`convertToIls` — called at transaction sync and expense-entry time to stamp `ilsAmount`/`fxRateToIls` on non-ILS rows.
- `buildReportPeriodLabel`/`getVATReportingDate`/`expandPeriodLabelsInRange`/`nextOpenPeriodLabels` — central logic for stamping and querying `vatReportingDate` across transactions, reports, and report-workflow.
- `getJournalEntryCurrentIndex`/`incrementJournalEntryIndex` — sequential numbering consumed by bookkeeping when posting journal entries.

## Related topics
Depends on: expenses (`Expense` entity), transactions (legacy `Transactions` entity — marked for removal), documents (`SettingDocuments` entity). Depended on by: nearly all reporting/transaction modules — reports, report-workflow, transactions, expenses, bookkeeping, documents.
