# New personal settings

This is the additive `/settings-new` implementation. Keep `/settings` and all
files under `pages/settings/` unchanged during the design trial.

- `SettingsNewPage` reuses the existing `SettingsPage` form builders and
  persistence methods, with a separate standalone template and scoped styles.
- Includes personal/family/business settings and subscription/payment/history,
  permissions, banking and category-rule settings.
- Side navigation has collapsible personal and subscription groups.
  Content scrolls inside `.settings-scroll`; never scroll the document root.
- Preserve company-specific field visibility, represented-client restrictions,
  business proprietor/number synchronization and existing delete confirmations.
- Profile/logo uploads reuse `AccountImageComponent`; use authenticated images,
  not the sample businesses or people in Figma.
- Figma assets in `assets/settings-new/` are local. Never use expiring Figma URLs
  in runtime code. Existing Simpler font files are reused.
- The preview harness is temporary, uses synthetic data and must not be shipped
  as an application entry point or bypass authentication/route guards.

See `docs/tasks/active/settings-personal-redesign.md` for validation and limits.
- Account, spouse and each child start read-only with one Edit action. Editing
  shows Save/Clear. Clear resets only the draft and keeps edit mode open. Close
  edit mode only after a successful server response (and account-profile refresh
  for personal/spouse); failures retain the entered values and edit state.
- These new-page callbacks use the existing AuthService APIs without changing
  the old SettingsPage callbacks. Reload the saved form from server values and
  preserve local calendar dates. New family members open directly in edit mode.

## Subscription and connection presentation

- `SettingsNewSubscriptionComponent` inherits the existing subscription handlers.
  Preserve cancellation confirmation, pending-change event IDs, owner/complimentary
  restrictions and provider-verified card replacement. No new billing calculations.
- Eight section markers drive navigation; the subscription group's six links are
  separate from the personal group's account/business links. Lazy connection
  activation must retain the existing module gate for bank-source reads.
- Reuse Gmail/inbound-email components and inherited permission/SHAAM handlers.
  Keep OpenBankingManagementComponent's saved reads and verified cancellation
  previews; do not call provider refresh or disconnect on page entry.
- See `docs/tasks/active/settings-subscription-redesign.md` for verification.
- Category UI inherits MyCategoriesTabComponent handlers and providers, with a separate template/styles and shared searchable selects. Keep old category files unchanged. Load only when its section is reached.
- Personal Cancel restores the entry snapshot (including after Clear), resets touched/dirty state, and closes editing. It is disabled while saving; explicit image saves remain separate.

## Temporary section memory

- SettingsNavigationSessionService stores only the last section in root-service
  memory for the current app instance. No DB/localStorage/sessionStorage writes.
- Reset on Firebase owner changes (including sign-out) and delegated-client
  changes even while settings is unmounted. Generation-bound visit contexts
  reject trailing scroll events from previous identities.
- New page instances restore the section without form/edit state. Keep the
  restored anchor aligned while async content resizes; stop repositioning on
  wheel/touch/pointer/keyboard interaction or explicit sidebar navigation.
- Reloading/reopening starts at account. Do not persist unsaved forms or pixels.

## My Agent (2026-11-19)

The agent section loads the shared MyAgentComponent on first visit, preserves
the existing scrolling/session navigation, and supports section=agent plus an
owned notice ID. The shared bell and verified banking-return offer use the same
owner-only API. Never keep a prior owner's data after owner/view-as changes.
Rule source labels are additive; original creator and latest editor differ.
