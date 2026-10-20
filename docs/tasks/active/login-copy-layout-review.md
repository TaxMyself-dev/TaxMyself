# Login copy layout and pending user copy edits

- Status: WAITING_USER_APPROVAL
- Branch: codex/feezback-delete-payment-source
- Worktree: existing TaxMyself-feezback-spouse, continuing the user's pending edits
- User explicitly forbids merge/push until approval of this result.

Preserved both user edits: login heading and payment-source consent explanation.
Login media now uses normal column flow with a responsive gap, centered balanced
heading, bounded illustration height and no absolute text/image overlap. Existing
mobile behavior (media hidden below 1000px) is preserved.

Verification: Angular production build exited 0; inspected emitted login bundle
4876.c82af92c8b8f3d8b.js to confirm it contains the final responsive gap. Browser
checks: 1440x900 gap 45px, horizontal center difference less than 0.001px;
1024x600 gap 32px and zero horizontal overflow; 390x844 media hidden and zero
horizontal overflow. git diff --check passed. Existing CSS/bundle and CommonJS
warnings remain. No new behavioral unit tests for this reversible layout change.

No backend/schema/authentication/provider change. No main update or remote push.
Pending explicit user approval before integration and push. Screenshot provided
in chat; temporary helper scripts were removed.
