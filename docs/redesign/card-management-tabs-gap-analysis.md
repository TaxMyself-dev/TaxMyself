# card-management vs booking-account-catalog — gap analysis (2026-08-15)

Read-only investigation, no code changes. Triggered by having two admin-panel
tabs managing `booking_account`: the old "כרטיסים" (`CardManagementComponent`)
and the new "כרטיסי טופס 6111" (`BookingAccountCatalogComponent`, Form 6111
reference-card project Phase 2). Goal: know exactly what the old tab does
that the new one doesn't, before collapsing them into one.

## 1. Old tab — `CardManagementComponent` ("כרטיסים")

Files: `frontend/src/app/shared/card-management/card-management.component.{ts,html}`

**Columns (table):** קוד (code), שם (name), חתך (sectionName), קוד 6111
(code6111), % מע"מ, % מס, % הפחתה, ציוד (isEquipment), הכרה (recognitionType),
סוג דוח (reportScope: pnl/annual/technical), היקף בעלות (owner: SYSTEM /
ACCOUNTANT+name / CLIENT+name), actions.

**Filter:** ownerType (הכל / מערכת / רואה חשבון / לקוח) — client-side.

**Actions:**
- **Edit** (pencil icon → dialog): name, code, sectionId, code6111,
  vatPercent, taxPercent, reductionPercent, isEquipment, recognitionType,
  **reportScope**. For SYSTEM-owned rows, fetches and shows a shared-impact
  warning ("affects N sub-categories across M businesses") before confirming.
- **Excel export**: full 11-column xlsx of whatever's currently filtered,
  RTL, bold header.
- No add, no delete, no activate/deactivate.

**Backend calls:**
- `GET bookkeeping/accounts` (admin-only guard) — `isActive: true` is
  hardcoded server-side; optional `ownerType` filter. Returns rows across
  **all owner scopes** (SYSTEM + every ACCOUNTANT's + every CLIENT's own
  cards), not just the 68 SYSTEM ones.
- `GET bookkeeping/sections`
- `GET bookkeeping/accounts/:id/usage`
- `PATCH bookkeeping/accounts/:id` → `CatalogService.updateAccountFields`

**Category/sub-category?** No. It touches `booking_account` only. Renaming
the KeepInTax-facing category/sub-category names is a *different* screen
entirely (`category-management` tab) — not part of this component and not
affected by this consolidation question.

**Reference rows (321)?** Never shown — `isActive: true` filters them out
entirely.

## 2. New tab — `BookingAccountCatalogComponent` ("כרטיסי טופס 6111", mode=admin)

Files: `frontend/src/app/shared/booking-account-catalog/booking-account-catalog.component.{ts,html}`

**Columns:** שם הכרטיס (name), קוד 6111, קטגוריה (6111) (category6111),
תת-קטגוריה (6111) (subCategory6111), חלק (formPart A/B/C), סטטוס (isActive
badge), % מע"מ, % מס, % הפחתה, actions. **No code column, no חתך/section
column, no owner/ownerType column, no reportScope column.**

**Filter:** formPart (A/B/C), isActive (active/reference), free-text search
(code or name).

**Actions:**
- **Activate** (inactive reference rows only): opens a dialog requiring
  type, sectionId, vat/tax/reduction%, isEquipment, recognitionType,
  categoryName — all required, none defaulted — then calls
  `createAccountWithSubCategory` under the hood.
- **Edit** (active rows only, admin mode): name, code, sectionId, code6111,
  vatPercent, taxPercent, reductionPercent, isEquipment, recognitionType.
  **No reportScope field** in this dialog, even though the backend endpoint
  accepts it.
- **Deactivate** (active rows only, admin mode): blocked with an itemized
  dialog (name + owning scope) if any sub_category still points at the card.
- No Excel export. No add-from-scratch.

**Backend calls:**
- `GET admin/booking-accounts` — SYSTEM scope only (68 operational + 321
  reference), no owner filter since there's only one owner.
- `GET bookkeeping/sections` (shared)
- `PATCH admin/booking-accounts/:id` → same `updateAccountFields`, but
  refuses `6111-%` reference codes
- `POST admin/booking-accounts/:id/activate`
- `PATCH admin/booking-accounts/:id/deactivate`

**Category/sub-category?** No CRUD — only *displays* the official
`category6111`/`subCategory6111` read-only columns and pre-fills
`categoryName` in the activate dialog. Never touches the KeepInTax category
tree.

## 3. Gap table

| Capability | Old tab | New tab |
|---|---|---|
| Shows SYSTEM operational cards (68) | Yes | Yes |
| Shows SYSTEM reference cards (321, inactive) | No | Yes |
| **Shows ACCOUNTANT-owned cards** | Yes | No |
| **Shows CLIENT-owned cards** | Yes | No |
| **Owner-scope column / filter** (ownerType + owner name) | Yes | No |
| code column | Yes | No (name only in table) |
| חתך / section name column | Yes | No |
| Edit: name/code/sectionId/code6111/vat/tax/reduction/isEquipment/recognitionType | Yes | Yes |
| **Edit: reportScope (pnl/annual/technical)** | Yes | No (missing from dialog, backend supports it) |
| **Shared-impact usage warning before editing a SYSTEM card** | Yes | No |
| **Excel export** | Yes | No |
| Activate a reference card into a real card | n/a (nothing to activate) | Yes |
| Deactivate + blocking-list dialog | n/a | Yes |
| Official 6111 category/sub-category columns | No | Yes |
| formPart column/filter | No | Yes |
| Create a brand-new card from scratch | No (neither tab) | No (neither tab) |
| Edit category/sub-category *names* (KeepInTax tree) | No (neither tab — lives in `category-management`) | No |

**Answers to the three specific questions asked:**

- **Renaming KeepInTax category/sub-category names**: neither tab does this.
  It's a separate, third admin-panel screen (`category-management` /
  `CategoryManagementComponent`), untouched by either of these two and
  irrelevant to this merge decision.
- **Creating a brand-new card from scratch**: neither tab does this either.
  That flow (`POST bookkeeping/accounts`, full law + section + category, no
  reference row involved) lives only in the accountant's "add account"
  dialog on `clients-panel.page.ts` (`addAccountModalVisible` /
  `createAccount()`) — a third, unrelated UI. Not a gap introduced by
  removing the old tab.
- **sub_category management beyond activate/deactivate**: the new tab's
  deactivate flow only *reads* sub_category rows (to build the blocking
  list) — it never creates/edits/repoints them. The old tab doesn't touch
  sub_category at all either. So there's no sub_category-management
  capability at stake in this merge.

**Real gaps to resolve before removing the old tab:** ACCOUNTANT/CLIENT-owned
card visibility (and their owner-scope column/filter), the code/חתך table
columns, reportScope editing, the shared-impact usage warning, and Excel
export.

No code changes were made in this investigation.
