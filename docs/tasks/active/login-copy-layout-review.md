# Login copy layout and pending user copy edits

- Status: VERIFIED
- Branch: codex/feezback-delete-payment-source
- Worktree: existing TaxMyself-feezback-spouse, continuing the user's pending edits
- User explicitly approved this final layout and both copy changes on 2026-10-20.

Preserved both user edits: login heading and payment-source consent explanation.
Login media uses normal column flow and a centered heading. Following user
feedback, restored the illustration to the original contain-fit scale rather
than capping it at 65svh. A wrapper excludes only transparent SVG outer space
(viewBox remains unchanged), preserving artwork size and a real visible gap.
Existing mobile behavior (media hidden below 1000px) is preserved.

Verification: Angular production build exited 0 after this revision. Emitted
bundle contains aspect-ratio:906/440 and max-width:1100px. At 1877x872 the
original calculated scale was 1.095477 and the new measured scale 1.095475
(rounding difference only), visible artwork-to-heading gap 81.96px. At
1024x600 the visible gap was 55.74px with no horizontal overflow. git diff
--check passed. Existing CSS/bundle and CommonJS warnings remain. No new
behavioral unit tests for this reversible layout change.
No backend/schema/authentication/provider change. No main update or remote push.
Explicit user approval received before integration and push. Screenshot provided
in chat; temporary helper scripts were removed.

## Main integration (2026-10-20)

Fetched origin and verified clean local main equals origin/main at b1f7b27f
before merging. Approved source commits: a0cb8691 and 95429901. Integrated on
codex/integration without conflicts. Scope is exactly the two user copy edits,
login illustration wrapper and responsive spacing/size correction. Local API
ports remain 3000. No backend, database, provider or production operations.

Combined production frontend build and isolated settings deletion tests passed.

Integration checks (frontend/), both exited 0:
- npm run build -- --configuration production
- npm run ng -- test --watch=false --browsers=ChromeHeadless --include=src/app/pages/settings/settings-source-deletion.spec.ts --ts-config=tsconfig.feezback-spouse.spec.json --karma-config=karma.feezback-spouse.conf.js
Four tests passed. CSS text matches the visually approved feature version after
normalizing checkout CRLF/LF; no semantic difference. Git diff/show checks passed.
No backend checks repeated because this delivery changes only frontend copy/layout.
