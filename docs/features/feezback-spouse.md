# Optional spouse Feezback connection

The canonical /billing/open-banking screen checks GET /feezback/connection-options
immediately before redirect. A current hasOpenBanking flag OR a historical
hasSpouseFeezbackIdentity flag offers an unchecked spouse checkbox. First-time
users proceed with the existing primary flow. Canceling does not create a link.

POST /feezback/consent-link accepts only an optional boolean spouse. Enrollment
authorization is unchanged. The backend derives all identifiers from the
authenticated Firebase UID: primary UID_sub, secondary UID_sub_spouse. The
secondary identity is reused after abandoned flows and renewals; no random SUBs
or identity mapping table are created. Spouse personal ID is prefilled when
available and remains editable in Feezback.

Only the spouse UserDataIsAvailable / DataRefreshComplete webhook verifies a
valid, unexpired provider consent linked to a source before persisting the user
flag. Link creation, browser return, profile editing and ordinary discovery
cannot set it. Expiry/revocation never clears the historical flag. Connection
state is aggregated over both known identities; incomplete reads preserve the
previous state unless a positive connection is proved.

Discovery, full sync, source retries, direct account reads and admin date-range
pulls resolve the appropriate identity. Source.connectionRole (primary/spouse)
is the single persisted identity marker. user_source_sync_state.sourceRecordId
references source.id; full_transactions_cache.sourceRecordId also references it
so bill association and duplicate matching cannot confuse equal displayed numbers.
Readable sourceName/sourceId/paymentIdentifier values have no spouse suffix.
The source unique key is (userId, sourceType, sourceName, connectionRole).
Retry and association requests carry sourceRecordId and verify user ownership;
ambiguous legacy requests without the ID are rejected. Settings display the
connection role separately from the account number. AsyncLocalStorage isolates
concurrent provider pulls. Existing opaque externalTransactionId values retain
their deterministic spouse suffix to preserve import idempotency and classification
links; these are transaction keys, not displayed account identifiers.

## Deployment

Apply the appended user.hasSpouseFeezbackIdentity and source-record schema/data
changes in docs/redesign/cutover.sql before deploying. Pause sync writers during
source backfill and take a backup first. Existing users default to false;
there is no backfill that creates secondary provider users. No production SQL,
live consent creation, provider mutation, or external webhook was executed.

## Verification

Focused backend tests cover fixed SUBs, JWT identity, checkbox API validation,
webhook verification, invalid/expired consent, connection aggregation, failed
identity recovery, async isolation, source retry routing, provider duplicate
regressions, direct-card exclusion and scoped consent cleanup. Frontend tests
cover first connection, selection, cancellation, errors and duplicate submission.

Manual sandbox checks before release: connect two separate accounts in one bank;
confirm both appear and sync; renew the spouse consent without replacing the
primary; expire both and confirm the selection remains available. Also verify
provider handling of shared accounts exposed through both identities: this
feature isolates their feeds and does not introduce cross-identity account
merging. Provider pricing and deletion behavior remain outside this change.

## DEV source backfill (2026-10-20)

Applied only to keepintax-dev using backend/scripts/migrate-source-records.js.
The helper refuses other database names and partial schemas, saves a Git-ignored
rollback snapshot before mutation, and verifies counts plus SHA-256 digests of
all unchanged fields in source, sync state, full cache, slim state and legacy
transactions. Links are resolved using original names BEFORE suffix removal.
No rows, consents, resource IDs, bill IDs, external transaction IDs, user flags,
amounts or classifications were removed or replaced. Existing cross-identity
duplicate feeds are preserved; cross-identity account merging is outside scope.

Result: 31 sources, 21 sync rows, 658 cache rows, 355 slim rows, 0 legacy rows;
2 spouse sources, 2 foreign keys, 0 broken links, 0 suffixed account identifiers.
Use node scripts/migrate-source-records.js verify from backend/ to compare with
the ignored snapshot before further application writes.
