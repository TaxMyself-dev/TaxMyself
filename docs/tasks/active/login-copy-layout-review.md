# Login copy layout and pending user copy edits

- Status: WAITING_USER_APPROVAL
- Branch: codex/feezback-delete-payment-source
- Worktree: existing TaxMyself-feezback-spouse, continuing the user's pending edits
- User explicitly forbids merge/push until approval of this result.

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
Pending explicit user approval before integration and push. Screenshot provided
in chat; temporary helper scripts were removed.
