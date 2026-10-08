# KT-047 — Independent billing development ports

- Status: COMPLETE
- Current diagnostic override: frontend serves 4200 and API targets 3000 at
  owner request. Backend local env still defaults to 3001; actual watch process
  must use PORT=3000 while this override is active.
- Branch: codex/billing-debt-recovery
- Scope: billing worktree only; local backend 3001, frontend 4201.
- Backend start:watch loads its own ignored backend/.env without overriding terminal values; start:billing
  pins PORT=3001; existing watch script retains schema synchronization guard.
- Local .env independently copied from authorized development configuration;
  CardCom local return URLs use 4201. No secrets committed.
- Frontend start:billing serves 4201 and local API endpoint uses 3001.
- Verification: Node script syntax, ignored env file, local configuration and
  diff checks. Full app not booted; shared dev database remains shared.
- User must point ngrok at 3001, update local webhook URL and restart billing.
- 2026-10-08: owner requested standard ports for Feezback diagnosis after
  stopping the chat servers; both worktrees retain independent env files.

- 2026-10-08: restored separate ports after owner confirmed start:watch works.
  Removed dotenv override from optional billing wrapper; preserved temporary
  legacy banking diagnostic flag in local env for start:watch. Both checkouts
  remain independent; no production settings changed.
