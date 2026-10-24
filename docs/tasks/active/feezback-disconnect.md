# Feezback consent termination and full disconnection

- Status: `WORKER_COMPLETE`
- Task manager: current feature chat
- Worker: scoped backend/frontend helpers; task manager owns retention/race tests and final review
- Worktree: dedicated feezback-disconnect worktree
- Branch: `codex/feezback-disconnect`
- Base commit: `4dc1306d208fe2bed3ab4a7a973701c5f9f7a227`

## Business outcome

Customers and administrators can cancel a specific provider consent or disconnect all open-banking consents, then reconnect without losing source associations or classifications.

## Acceptance criteria

- [x] Separate single-consent cancellation and full-disconnection UI for owner and admin, previewing every affected local account/card.
- [x] Backend derives identity and verifies real owner/admin permissions; accountant delegation cannot terminate.
- [x] Termination probes primary and spouse identities, including pending onboarding; partial errors remain visible and retryable.
- [x] hasOpenBanking reflects verified current connections; verified complete absence of permissions resets spouse connection and pending consent flags, while preserving all application data and stable identity derivation.
- [x] No source, bill association, classification/rule, approved expense, or retained slim transaction is deleted.
- [x] Changed provider consent/resource IDs reuse permanent source IDs and associations; repeated rediscovery creates no duplicate account/card in mocked regression tests.
- [x] Existing nightly cache cleanup remains unchanged; rebuilding an empty cache preserves manual classification and confirmed states.
- [x] Existing-source outcome writes use atomic identifier predicates; stale pulls cannot restore revoked IDs or replace renewed IDs. First inserts do not overwrite concurrent discovery.
- [x] Late discovery selects the actual valid linked consent instead of a terminated primary pointer on shared sources.
- [x] Synthetic demo connections are protected before provider calls or state mutation.
- [x] Focused backend/browser tests, Nest build, and Angular production build passed. No production access or live provider calls.

## Scope and constraints

- User approved the plan and implementation in a separate worktree on 2026-10-22.
- Primary checkout has an untracked app-mapping directory, disclosed before explicit separate-worktree approval. It remains untouched. Main integration is deferred to the primary integration manager until clean.
- No schema, billing, accounting, credential, external-contract, live webhook, or deployment change. Existing Feezback DELETE consent contract is consumed.
- Ignored backend environment copied from primary checkout without printing its contents. Tests never boot the full application or contact a database/provider.

## Implementation and review

- New Firebase-authenticated GET /feezback/disconnection-targets and POST /feezback/disconnect, available independently of subscription entitlement.
- Provider-owned consent IDs only; complete nonterminal list, exact owned-list GET 404 attribution, authenticated DELETE and fresh verification. Token errors, malformed responses and asynchronous termination cannot prove success.
- Provider-confirmed stale pointers are cleared; shared sources are rebound only using real valid/unexpired linked-source proof. Sources, bill links and durable financial data remain intact.
- Owner entry: Settings permissions tab. Admin entry: clients dashboard banking management action. An auth-only /billing/open-banking/manage route is also reachable from the blocking billing dialog without changing existing route guards.
- Independent review found and corrected malformed-card false absence, pending-consent rebinding, and later discovery restoring a terminated direct consent pointer.

## Validation

- Initial complete Feezback regression selection: `$feeSpecs = @(rg --files src/feezback -g '*.spec.ts'); npm test -- --runInBand --no-cache --runTestsByPath @feeSpecs` from backend: 15 suites / 145 tests passed, exit 0. Final reviewed changes were then checked with the focused selections below.
- Final shared-consent/helper/reconnection selection: connection-state, reconnect and consent/open-banking-connection specs: 3 suites / 18 tests passed, exit 0.
- Final disconnection-service and API transport selection: 2 suites / 34 tests passed, exit 0.
- Retention/source-state/source-association/reconnection selection: 5 suites / 26 tests passed, exit 0; after the two extra first-insert race cases, final source-outcome-consent-race + user-sync-state.service + source-record-association selection: 3 suites / 22 tests passed, exit 0.
- Final `npm run build` from backend: passed, exit 0.
- Final `npm run build -- --configuration production` from frontend: passed, exit 0, build hash de43170363cc8b9c. Existing style-size/CommonJS/initial-size warnings remain; no error budgets changed or bypassed.
- Final `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/components/open-banking-management/open-banking-management.component.spec.ts --ts-config=../.test-tmp/frontend-banking.spec.json`: 9 ChromeHeadless tests passed, exit 0. Scratch config isolates the new spec, extends tsconfig.spec.json, includes test.ts/polyfills.ts, sets jasmine/node types, skipLibCheck and root rxjs path mappings. It is ignored and not shipped.
- git diff --check: passed. Environment, scratch logs/config/backups, dependencies and build output are ignored and excluded from the commit.

## Known existing failures and local environment repair

- Accidental broad Jest regex selection matched the worktree name and was stopped. Its unrelated documents/document-kind.spec.ts failures were independently reproduced against the exact base backend using verified snapshot/restore: 20 passed / 2 failed, exit 1, both on base and feature. Assertions expect an older update shape and a removed deriveArchiveStatus method. No full-repository green claim is made; no unrelated document code was changed.
- Frontend npm ci fails an existing lock consistency check (Missing encoding@). Isolated installation used npm install with --package-lock=false; no tracked manifest/lock change.
- Initial frontend dependency drift/duplicated RxJS caused compilation errors, also reproduced with base frontend sources. Local repair only: `npm install --no-save --package-lock=false --legacy-peer-deps --no-audit --no-fund rxjs@7.8.1 pdfjs-dist@4.7.76`. PDFJS now matches its lockfile version; the final production build passes. No package version or budget changes are committed.
- Initial sandbox Jest/Angular/Nest cache permission failures were resolved with narrowly elevated commands after actual denials.

## Handoff

- Result: implementation complete locally; ready for primary manager integration review.
- Commit hash(es): reported in chat after the local feature commit.
- Changed files: Feezback transport/service/controller/module, connection helpers; transaction sync-outcome guard; frontend management component/page, settings/admin integration, billing-block entry; focused regressions and nearest topic docs.
- Schema / production / accounting / billing impact: none. Security: new actions enforce the approved owner/admin boundary. External API: existing documented contract only, tested with mocks.
- Risks / manual checks: real provider sandbox end-to-end validation remains before rollout; identifiers must remain the same visible account/card and currency, as in the existing stable source-key model. The discovery/disconnection queue is process-local; it is not a distributed connection-state lock. Existing-row metadata writes have separate atomic database predicates.
- Documentation updated: Feezback, transactions, settings and admin clients topic AGENTS plus this task.

## Integration

- Reviewed by: task manager and independent read-only reviewer, with correction loops.
- Integrated commit: none; main/integration checkouts were not modified.
- Combined verification: focused tests and both builds above; legacy document failures independently reproduced on base.
- origin/main verification: feature not pushed or merged.
- User-visible entry points: Settings > permissions/accounts; Admin > clients > banking management; /billing/open-banking/manage for owners without an active subscription.

## Approved table and warning follow-up (2026-10-22)

- Settings uses cancellation/reconnection row actions on its existing source table, identified by stable Source record ID. Complete disconnect and permission refresh follow that table. Disconnected records keep existing manual deletion as a separate action.
- Every cancellation refreshes the owned consent list before showing a modal. The modal shows all linked bank accounts/cards, including masked provider-only instruments absent from stored Sources. Such entries are preview-only and never create, rebind or delete Sources.
- If a source belongs to multiple permissions, the user explicitly chooses one. Incomplete reads prevent confirmation. Admin/standalone views use the shared table with a fallback row for pending permissions without identified instruments.
- Table loading, pulls, deletion, discovery and termination cannot overlap through these controls. A deferred initial check retries after the parent source table loads. Reconnection continues through the existing enrollment flow; retention and stable-source reconciliation remain unchanged.
- Confirmed static warning defect: absent-identity GET 404 recognition omitted the configured proxy prefix. Matching now uses the exact configured endpoint origin/path and owned identity; unrelated/token/wrong-origin errors remain uncertain. Mock reproduction confirms the fix, but the actual warning seen by the user is unconfirmed without the runtime failed response.
- Safe diagnostics now identify role, operation, stage and optional HTTP status without exposing raw errors, URLs, credentials or financial response bodies. UI explains which identity/read failed.
- Backend verification: 2 focused suites / 43 tests passed, Nest build passed. Frontend final focused selection: shared component + Settings row routing + existing source deletion, 32 ChromeHeadless tests passed. Independent read-only review found two UI gaps; both corrected and covered by regressions.
- No application servers, real provider calls, real disconnections, database changes, pushes or integration performed during this follow-up.
- Final follow-up Angular production build passed (hash 110508ec7fa41d00); existing size/CommonJS warnings remain. git diff --check passed.

## Approved profile and full-reset follow-up (2026-10-23)

- User approved implementation in the same feature worktree, based on local commit 359571d7.
- Acceptance: every authenticated browser bootstrap refreshes profile from the backend; successful owner consent termination and authoritative disconnected discovery refresh the cached/reactive profile and yellow banner without manual reload.
- Acceptance: complete verified absence of all primary/spouse permissions resets banking connection flags and consent initiation. Partial failures or remaining pending permissions preserve uncertainty. No Source, association, classification, transaction, expense, subscription or unrelated profile data is reset.
- Preserve delegation/session UID boundaries and stable primary/spouse provider identity suffixes. No live calls, database operations, app servers or main integration are authorized by this follow-up.
- Implementation: StartupService revalidates the UID-bound owner profile once per authenticated browser bootstrap even with existing tab cache. Explicit owner request context omits represented-client/business headers while preserving delegation. Bounded transport failure preserves session/cache.
- AuthService publishes accepted owner-profile updates; request generation and UID checks discard stale/wrong-owner responses. Cached MyAccount pages react immediately and reread effective profile on Ionic reentry. Complete discovery and termination refresh profiles before notifying parent UI.
- Verified complete absence of all nonterminal permissions resets hasOpenBanking and hasSpouseFeezbackIdentity, and clears lastConsentInitiatedAt. Pending/partial/failed checks do not reset spouse/onboarding flags. Successful single-last-consent cancellation also qualifies. Source rows/mappings/classifications/approved expenses and all unrelated user/billing data remain unchanged.
- Retained intentionally: cache/sync outcome history, lastSourcesRefreshAt, spouse personal profile, stable UID-derived provider identities, Source.connectionRole and enrollment/subscription terms. No schema or billing-contract changes.
- Independent review found spouse webhook verification could race an old empty snapshot. Verification+flag update now share the per-user connection queue; webhook separately queues discovery after verification, avoiding nested locks. Controlled regression covers this and repeated spouse/primary reconnect retaining six original Sources/bill links.
- Final focused backend checks: 4 exact suites (disconnection/API/reconnection/spouse), 80 tests passed. Final frontend isolated mocked checks: owner-profile/startup/interceptor, cached dashboard, management and Settings, 44 tests passed (including logout/relogin invalidation). No live provider requests, app servers, database changes, push or integration.

- Final Nest build passed. Owner-profile request generations also invalidate on Firebase session transitions, preventing old responses after logout and same-UID relogin. Final code review resolved the spouse verification blocker; no further blockers found.
- Final Angular production build passed on the final session-invalidation source state; existing CommonJS/style/initial-size warnings remain, with no budget/config changes. git diff --check passed.

## Actual runtime diagnosis and options reconciliation (2026-10-23)

- User explicitly authorized inspecting running checkout and their database flags, and fixing the stale spouse dialog without another termination.
- Windows listeners: frontend4200 process41004 points at feature frontend Angular CLI; backend3000 process41816 points at feature backend/dist/main. Compiled reset present. Feature environment targets keepintax-dev; canonical watch launcher disables schema synchronize.
- Matched the unique account from the active dashboard identity. Targeted read-only SQL confirmed hasOpenBanking=0 and hasSpouseFeezbackIdentity=1. No unrelated rows read and no direct SQL writes.
- Normal Settings permission discovery (GET only) verified full disconnection and changed both flags to0 through the existing reset service. Targeted SQL recheck confirmed both0; browser shows disconnected status and yellow dashboard banner. No consent creation/termination or DELETE invoked.
- Root cause: connection-options read stored flags without authoritative discovery, so stale flags persisted until the user opened permission management. Reconcile before returning connection-options; preserve partial/pending states and synthetic demo behavior. No schema or unrelated profile/business changes.
- Follow-up verification: 4 focused backend suites /64 tests passed, Nest build passed, independent review found no blockers, diff check passed. Provider discovery adds its existing read/retry latency to connection-options. Frontend unchanged. Screenshot of verified yellow dashboard banner retained outside Git in task workspace.

## Reconnection failure visibility (2026-10-23)

- User reported Continue briefly loading then returning home. Enrollment load/prepare/connection-options/link failures all silently navigated to origin, hiding the actual failure.
- Keep failed enrollment/connection attempts on-page with fixed safe Hebrew messages, allowlisted HTTP status and retry. No raw response/token/URL displayed. Spouse choice is retained for retry; explicit cancel still returns to origin. Initial-load retry resumes active/complimentary flow.
- Live inspection saw transient local server connectivity errors. Subsequent authenticated enrollment navigation successfully generated a provider link and reached Feezback's initial screen. Stopped before provider Continue/bank selection/authorization; no consent was granted or terminated. This verifies the current route works but does not prove the historical failure's exact cause.
- Browser screenshot saved outside Git; signed provider URL/token is not recorded in documentation or commit.
- Validation: 30/30 focused billing/open-banking mocked browser tests passed; Angular production build passed with existing warnings. Diff checked. No backend changes for this visibility fix.

## Approved verified-disconnect cache cleanup (2026-10-23)

- User explicitly approved implementing in the same worktree from cf8cf625. No live disconnections or cache/database operations requested for implementation verification.
- Acceptance: delete temporary FullTransactionCache rows only for tenant-owned stable Sources whose disconnection is provider-verified and which have no other nonterminal permission. Preserve other identities/sources, unknown/partial scopes and shared-permission sources. Full verified absence across both identities may clear all tenant temporary cache including unattributed rows.
- Never delete or change Expense, SlimTransaction classifications/confirmation, merchant rules, Source records or bill associations. Reconnection must reuse stable Source IDs and restore retained classifications/confirmed metadata.
- Cleanup and Feezback persistence must share a per-user lock and recheck current connection/source state, preventing late in-flight pulls or completion callbacks from refilling cache or restoring stale freshness after cleanup. Generic classification/ingestion behavior remains unchanged.
- Partial cleanup must not reset unrelated source outcomes. Full cleanup invalidates transient cache freshness/outcomes only. No schema, accounting, subscription, credential or provider-contract changes.
- Implemented FeezbackCacheCleanupService with tenant/role ownership checks and transactional cache-only deletion. Full cleanup publishes hasOpenBanking=false under the shared User lock, invalidates cache freshness and resets full transient outcomes/source-discovery freshness. Selective cleanup runs after source consent-pointer reconciliation; GET reconciliation cleans only full verified disconnection.
- Feezback-only persistence and completion guards share the queue/User lock and check connected state plus owned stable Source IDs/current consent. Disconnected or ambiguous sources cannot refill cache. Full late running/completion/failure/cache-ready promotions cannot resurrect cleaned state; active sources still ingest normally after reconnect.
- No changes to generic transaction processing, durable classifications/confirmation, approved expenses, rules, Sources, bill mappings or subscription/enrollment terms. Partial null/unattributed cache rows remain conservatively until nightly cleanup; full verified disconnect deletes all tenant temporary rows.
- Independent review verified retention, tenant boundaries, alternate/pending protection and late callbacks. Both identified ordering gaps (partial GET before pointer clear and full cleanup before locked flag update) were corrected. Focused late-pull/reconnect/admin/direct-card/spouse/retention selection: 6 suites/60 tests passed. Final helper+disconnection selection: 2 suites/52 tests passed.
- Final affected regression: all 18 exact Feezback suites /203 tests passed (runTestsByPath), and final Nest build passed. Existing retention selection above passed. Frontend unchanged; no frontend build needed for this backend-only follow-up. git diff --check passed. No live provider/disconnection/cache/database operations performed during implementation verification.

## Authorized existing-cache cleanup and flow UI (2026-10-23)

- User explicitly requested verifying shmuelharel10@gmail.com and conditionally clearing existing cache without additional termination or touching expenses/classifications/associations; also requested yellow connection banner and disconnected empty-copy on transactions tables.
- Both local and production browser tabs were observed. Clarification offered; default scope explicitly stated as feature worktree development DB (keepintax-dev), consistent with prior task. Production untouched.
- Targeted read-only baseline: flags false/false; cache767, slim51, Expense1, classification rules3, Source0 (previously manually deleted), Bill1. SHA256 digests computed in memory over each owned durable table; only counts/digests stored outside Git, no financial records output.
- Normal authenticated Settings GET disconnection-targets verified no remaining permissions and ran the approved conditional cleanup. No POSTdisconnect, DELETEconsent or direct SQL mutation was used.
- Read-only postcheck confirmed cache0; all durable table hashes unchanged, including all51 slim rows, Expense1, rules3, Source0 and Bill1. UI displayed fully disconnected result.
- UI acceptance: disconnected flow view shows existing yellow connection banner above tables, owner CTA follows existing consent/enrollment flow, each empty table says 'אין נתונים כי אין חיבור לבנקאות פתוחה'. Connected empty/filter/loading/error states and delegated identity boundaries remain unchanged.
- Independent UI review corrected shared-filter initialization and late triggerSync callbacks after disconnection. Known-disconnected state clears retained frontend rows, cancels pending transaction reads/polling, and uses the exact disconnected copy; connected filtered-empty remains generic. Existing consent disclosure text and billing/access boundaries are preserved.
- Broad generic consumer check encountered an unrelated baseline fixture failure: table-action-consumers.spec.ts 'keeps both allocation actions...' supplies neither docNumber nor MessageService while the unchanged IncomesPage action now calls confirmResumeAutomaticAllocation; missing docNumber enters messageService.add. The fixture, handler and table-actions.ts are unchanged baseline files (no diff from HEAD). No unrelated test/application patch made and no full-suite-green claim; final affected UI selection is recorded separately below.
- User explicitly confirmed DEV ONLY in response to environment clarification. All runtime database/provider checks and conditional cache removal were through the local feature app/development database; no production inspection or mutation. Final focused affected frontend tests: 37/37 passed, including disconnected lifecycle/late-error and shared-table desktop/mobile behavior.
- Final Angular production build passed (hash24051a701f06df94) with existing bundle/style/CommonJS warnings. Final live DEV flow view verified yellow banner and exact empty copy in both tables; screenshot retained outside Git. Diff check passed; no backend code changes for this follow-up.

## Two-user DEV JWT/provider comparison (2026-10-25)

- User explicitly authorized comparing failed shmuelharel10@gmail.com to successful harelazar@gmail.com, fixing DEV only and exposing no secrets. All DB reads constrained to keepintax-dev and these two emails; production application/database/configuration untouched.
- Used actual compiled FeezbackJwtService with a read-only two-user repository adapter and local DEV configuration. RS512 verification passed for both; identical issuer tpp/KNCAXnwXk1, service selectors, lifetime3600, ttl600, encryptflag, top-level/flow keys, defaultflow and localhost redirect origin. Both primary ID values were9-digit strings. Values of personal IDs/SUBs/tokens were not printed.
- Actual existing-proxy comparison: /token both200; /link Shmuel400/error1004 and Elazar200. Subsequent /link both200 and exact same Shmuel JWT replay200. The failure did not consistently follow the user; local immutable fields/signing mismatch is not proven. Generated onboarding links were discarded; no bank authorization/termination, application profile/accounting changes or direct SQL mutation.
- Upstream/public-key registration cannot be independently inspected: Cloud SDK reauthentication required and current browser account lacks Cloud Run view permission, as established in prior investigation. No production access or configuration changes attempted.
- Mitigation acceptance: exactly one bounded extra attempt for LGS POST /token or /link error1004 only, same signed request. Permanent failure still surfaces; other400/DELETE/data paths retain existing policy. This addresses intermittent behavior, does not claim upstream root-cause correction.
- Independent read-only review found no retry-scope/cap/logging blockers. Focused retry/auth/onboarding/redaction checks:5 suites69 tests passed. Final affected regression:all19 exact Feezback suites226 tests passed; shared signed body and terminal repeated1004 behavior covered. Other400/nonconfigured/data/DELETE behavior unchanged.
- Final Nest build passed and diff check passed. No key/TPP/proxy configuration changes. Local worktree mitigation only; upstream root cause remains unproven, permanent1004 still requires provider/proxy-side investigation.
