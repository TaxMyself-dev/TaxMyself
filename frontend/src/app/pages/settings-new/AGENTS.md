# New personal settings

This is the additive `/settings-new` implementation. Keep `/settings` and all
files under `pages/settings/` unchanged during the design trial.

- `SettingsNewPage` reuses the existing `SettingsPage` form builders and
  persistence methods, with a separate standalone template and scoped styles.
- This phase contains account, spouse, children, businesses and business creation
  only. Subscription, permissions, banking and category-rule redesign are deferred.
- Side navigation is one collapsible personal group with account/business links.
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
