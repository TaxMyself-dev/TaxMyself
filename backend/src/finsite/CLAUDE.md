## Purpose
Integrates with the Finsite bookkeeping-data API (M4U/Kraken external API) to pull company/account/payment-method (bank + credit card) metadata and balances using service-level credentials — a smaller, separate provider integration from `feezback`.

## Key entities/files
- `finsite.entity.ts` — `Finsite`: one row per payment method (bank account or credit card), storing Finsite's internal IDs (`getTransFid`, `accountFid`, `paymentId`, `accountId`, `finsiteId`), `bank`, `companyName`, `balance`, `paymentMethodType` (`SourceType`).
- `finsite.service.ts` — `FinsiteService`: `getFinsiteBills()` logs in with a username/password, fetches companies/accounts/booking-accounts, filters to `CreditCard`/`Current` methods, fetches balances, and upserts `Finsite` rows keyed by `getTransFid`. Also exposes lower-level `getFinsiteToken`, `getCompanies`, `getAccounts`, `getBookingAccounts`, `getBalances`, `getTransactionsById` wrapping the Finsite REST API.
- `finsite.controller.ts` — `FinsiteController` at route `finsite`, single `GET finsite-connect` endpoint using credentials from `FINSITE_ID`/`FINSITE_KEY` env vars (no per-user auth).
- `finsite.module.ts` — registers `Finsite` entity, wires the controller/service.

## Main flows
- `GET /finsite-connect` — authenticates against Finsite with env-configured credentials, pulls all companies/accounts/payment methods, and syncs balances into the `Finsite` table.

## Related topics
- transactions (`SourceType` enum shared with the transactions/Source model, though `Finsite` itself isn't linked to `Source` by FK)

## Notes
- `entities/finsite.entity.ts` is a byte-for-byte duplicate of `finsite.entity.ts` at the module root; only the root-level one is imported by `finsite.module.ts`/`finsite.service.ts`. The `entities/` copy appears to be dead/orphaned code.
- No `SharedModule`/auth guards on the controller — this integration looks unused/legacy compared to `feezback`, which handles Open Banking today.
