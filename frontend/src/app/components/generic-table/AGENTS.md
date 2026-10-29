## Purpose

Shared desktop table and mobile-card renderer. Row actions are part of the
table contract and must have identical availability and execution in both layouts.

## Key entities/files

- `generic-table.component.ts/html` accepts one `actions: IGenericTableAction[]`
  input. `rowActions`, `fileActions` and `mobileCardActions` inputs were removed.
- `table-actions.ts` defines the explicit action metadata and the shared
  row-aware resolver. The legacy `shared/table` still uses `ITableRowAction`.
- `../mobile-row-card` renders configured mobile cards; `../table-row-actions-menu`
  supplies the same mobile menu to cards and ordinary table rows.
- `*.spec.ts` covers shared rules, real bookkeeping/VAT consumer predicates,
  DOM rendering/clicks, file ownership and canceled file selections.

## Main flows and invariants
- Optional `emptyText` changes only a genuinely empty source collection on
  desktop/mobile. Its default remains the existing no-results text; local search
  or filtering of nonempty source rows retains no-results copy. Loading and sync
  failure branches retain priority over empty text.

- `showWhen(row)` always applies, on every layout and again before execution.
  `fileRequirement: 'stored'` additionally requires a nonblank string `file`
  or positive `sourceDocumentId`. No action name implies a rule.
- Consumer array order is display order. `desktopDisplay: 'icon'` preserves
  legacy file-button presentation; other actions have visible labels.
- `execution: 'fileInput'` explicitly passes the stable HTML file input to
  replacement callbacks. Ordinary actions receive `(null, row)`, including
  actions named `edit`. Never use hoveredRowInfo to find a mobile action's row.
- Mobile menus appear automatically from `actions`, including tables without
  `mobileCardConfig`. Loading actions show a spinner and cannot execute.
- `fileAttachmentEnabled` opts into the existing automatic paperclip action;
  only the VAT report currently enables it. It is suppressed by stored-file
  presence or `fileEditingEnabled: false`. Pending attachment labels still use
  `filesAttached`, `attachmentCount` and `fileName`.
- Only actions declaring `requiresFileEditing` are gated by fileEditingEnabled;
  preview/download and ordinary page actions retain their own predicates.
- Attachment selection emits `fileChange` once for the explicit selected row.
  Replacement callbacks own their file-change subscriptions; the table must
  neither clear the chosen file before they read it nor emit another upload.
  Native picker cancellation clears pending row state; consumers subscribing
  to replacement changes must terminate on cancellation too.
- Preserve columns, inline templates, search, selection, filters and report
  calculations when changing action plumbing. The separate legacy `app-table`
  is outside this contract.

## Related topics

- Bookkeeping issued documents/expenses/archive/clients/suppliers.
- VAT report manual-file replacement and Drive read-only attachments.
- Transactions, My Account, settings, report review and admin tables.
- Focused verification: `npm test -- --watch=false --browsers=ChromeHeadless
  --ts-config=tsconfig.table-actions.spec.json
  --include=src/app/components/generic-table/*.spec.ts
  --include=src/app/components/table-row-actions-menu/*.spec.ts`.
