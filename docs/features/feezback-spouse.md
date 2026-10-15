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
pulls resolve the appropriate identity. Existing primary source and transaction
IDs are preserved. Secondary source/payment and normalized transaction IDs use
a deterministic _spouse suffix, preventing collisions on masked numbers or
provider IDs. AsyncLocalStorage scopes normalization per provider pull and
isolates simultaneous users and identities. Dashboard labels display the spouse
designation in Hebrew. Admin diagnostics retain the exact provider identifiers.

## Deployment

Apply the appended user.hasSpouseFeezbackIdentity column in
docs/redesign/cutover.sql before deploying. Existing users default to false;
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
