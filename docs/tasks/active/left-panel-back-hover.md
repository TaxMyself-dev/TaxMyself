# Left panel back button hover

- Status: VERIFIED
- Branch: codex/left-panel-back-hover
- Worktree: billing-debt-recovery/TaxMyself (requested CardCom worktree)
- Base: df7fd270f793e2cf77bf262c6def4cc1c1719907

## Acceptance criteria

- Back action text and icon remain readable on hover in light and dark modes.
- Other button variants retain existing styles.

## Implementation

The existing ButtonComponent class input adds left-panel-back to the inner
PrimeNG button. Only that class overrides the primary hover color token.
Light mode uses #2a2626; dark mode uses #d5d5d6, matching existing transparent
button colors. No schema, production, security, accounting or API impact.

## Verification

Angular production build (npm run build -- --configuration production): PASS, exit 0. Existing bundle/style budget and CommonJS warnings remain. Focused Sass compilation and production CSS assertions: PASS for scoped selector, both theme colors and wrapper class forwarding. git diff --check: PASS. No browser visual check performed. Delivery: fast-forward main and normal origin push authorized by the user.
