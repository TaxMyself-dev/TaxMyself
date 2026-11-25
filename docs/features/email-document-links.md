# Linked documents from email

Connected Gmail and Outlook scans now discover PDF document links in email bodies,
including messages without file attachments. A successful download enters the existing
durable email storage/inspection/dedup/processing pipeline. This feature does not
grant access to private Drive files or supplier accounts and adds no OAuth scopes.

## Processing

- New initial/manual/nightly date-window queries no longer require `has:attachment`.
  Existing frozen runs and explicit caller queries retain their original meaning.
  This increases mailbox metadata reads; Composio/provider costs have not been measured.
- Parse MIME text/HTML without executing email HTML. Recognize document/download
  links (or generic view links with an accounting-document subject), normalize
  fragments/entities, and bound discovery to ten candidate links and 256 KiB of body.
  This is deliberately conservative discovery, not a claim to find every possible link.
- Source identity is owner + mailbox + message + `link:SHA256(normalized URL)`.
  Later runs reuse the original source record rather than replay blocked/paid work.
- Try bounded HTTPS first, including at most five redirects per request, static
  document links and embedded PDFs. If needed, launch a separate Chromium process
  and isolated context, render JavaScript, and inspect a bounded list of DOM actions.
- Prefer deterministic original/document selection. Only ambiguous choices reach
  the fixed `gpt-4.1-mini` selector: at most two calls and USD 0.01 reserved model
  budget per source attempt. Input is limited to 12,000 UTF-8 bytes with conservative
  per-call token/cost reservation and 80 output tokens. Rates assumed are USD 0.40/M
  input and USD 1.60/M output; revisit these constants when changing model/pricing.
  Browser, provider, hosting and later document analysis costs are additional.
- Model input contains page text and candidate labels/IDs, not candidate URL fields.
  Model output can select an existing ID or manual handling; it cannot supply code,
  URLs or credentials. Code rechecks the selected action and current sender/owner
  authorization before navigation or a paid call.
- Network/browser work has a 45-second cancellation budget. PDF inspection has its
  existing separate 15-second subprocess limit; cleanup may add a short tail.
  PDFs are capped at 10 MiB, parsed by the existing isolated inspector, and validated
  as readable or password-required before storage. Password-required downloads enter
  the existing protected-PDF lifecycle.

## Manual handling and recovery

Before external work, a fenced source reservation moves the item to `BLOCKED` with
`LINK_ATTEMPT_INTERRUPTED`. A completed attempt replaces that reason with a specific
access/expired/invalid/network/budget/manual reason or attaches the imported document.
If the process dies, it never automatically repeats possibly paid work. This first
version routes failed network attempts to manual handling too; no blind retries.

The owner's archive includes a pending-email-links panel, scoped to the selected
business using current sender/mailbox routing. It supports pagination, opening the
original link and uploading a PDF against that exact source. Signed URLs are returned
only by a separate authenticated no-store endpoint. Delegated and admin-impersonated
mail access is denied. Revoked/blocked sources are not exposed.

Scanner attempts and manual uploads share a per-source advisory lock, including
when a slow operation outlives its run lease. Manual uploads use the same durable
storage/content hash boundary, update the original item, and refresh its run. Storage
or linkage failures retain the pending row and are recoverable without another paid
download. Content dedup is still owner/business scoped. An accepted upload can be
password-required or duplicate; acceptance is not a claim that accounting analysis
has already completed.

No new database columns/tables or live schema application are required. Existing
reviewed durable-email tables and JSON metadata columns must already be present.
No live imports, schema writes, main integration, push or deployment were performed.
As with existing blocked intake items, unresolved link items keep their source
run partial; uploading refreshes the run so initial/nightly finalization can resume.

## Network and runtime boundary

Only public HTTPS on port 443 is supported. Each redirect and each browser proxy
CONNECT resolves DNS, rejects mixed/private/reserved answers, and pins a validated
IP to the actual socket. A loopback proxy is explicitly configured both at launch
and on the browser context. HTTP, internal addresses, credentials in URLs, oversized
responses and excessive connections/transfers are blocked. Browser requests prohibit
destructive paths and non-GET methods except one same-origin POST after an approved
document action. No passwords, CAPTCHA solving, account login or arbitrary agent code.

The browser runs with a minimal environment and fresh profile, not API credentials
or a personal browser session. Chromium sandboxing remains enabled. The production
image preserves the API's existing root user but includes `keepintax-link-browser`,
which drops the browser to the image's node user via `su-exec`. Its profile/download
directories remain private. Other environments can set `EMAIL_LINK_BROWSER_EXECUTABLE`
to an installed sandboxed browser/wrapper; `PUPPETEER_EXECUTABLE_PATH` is also supported.

Deployment must verify that the hosting runtime supports Chromium's sandbox under
that user. If it does not, use a dedicated sandbox-capable browser runtime; do not
add `--no-sandbox` to this downloader. Until then, affected links remain available
for manual handling. The container image could not be executed locally because the
Docker engine was not running. Windows Chromium behavior is separately tested.

## Verification

Commands and final counts/revisions are recorded in
[the task record](../tasks/active/email-document-links.md).

`node test/link-download-simulation.cjs` (from backend, after build) runs the actual
downloader, HTTPS redirects, DNS-pinned CONNECT proxy, Chromium, downloaded bytes and
real PDF inspection against local fixtures. It generates a short-lived fixture-only
certificate using OpenSSL, needs local TCP port 443, maps only the fixture hostname
to loopback in the test instance, and blocks all other destinations. Chromium trusts
only that fixture certificate by SPKI. The selector is stubbed in this offline test;
no paid model calls, real mailbox reads, Drive writes or production data are used.
The earlier synthetic live-model experiment is separate evidence, not a real-supplier
success rate. `LINK_SIM_CASES=post,blob` selects affected fixtures for diagnosis.

Frontend component checks use `tsconfig.email-document-links.spec.json` and
`karma.email-document-links.conf.js` (port 9893) because the default test tsconfig
compiles unrelated legacy specs even with `--include`. An existing mismatched export
in the supplier spec was reproduced using exact base-revision source files.
