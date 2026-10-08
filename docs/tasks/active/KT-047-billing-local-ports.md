# KT-047 — Independent billing development ports

- Status: COMPLETE
- Current configuration: frontend serves 4200 and API targets 3000.
  Backend uses start:watch with PORT=3000; set PORT explicitly in the terminal
  when an inherited value would override the local env.
- Branch: codex/billing-debt-recovery
- Scope: billing worktree only; local backend 3000, frontend 4200.
- Backend start:watch loads its own ignored backend/.env without overriding terminal values; start:billing
  pins PORT=3000; existing watch script retains schema synchronization guard.
- Local .env independently copied from authorized development configuration;
  CardCom local return URLs use 4200. No secrets committed.
- Frontend start:billing serves 4200 and local API endpoint uses 3000.
- Verification: Node script syntax, ignored env file, local configuration and
  diff checks. Full app not booted; shared dev database remains shared.
- User must point ngrok at 3000, update local webhook URL and restart billing.
- 2026-10-08: owner requested standard ports for Feezback diagnosis after
  stopping the chat servers; both worktrees retain independent env files.

- 2026-10-08: restored separate ports after owner confirmed start:watch works.
  Removed dotenv override from optional billing wrapper; preserved temporary
  legacy banking diagnostic flag in local env for start:watch. Both checkouts
  remain independent; no production settings changed.
