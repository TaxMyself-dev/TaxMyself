# KT-047 — Independent billing development ports

- Status: COMPLETE
- Branch: codex/billing-debt-recovery
- Scope: billing worktree only; local backend 3000, frontend 4200.
- Backend start:billing explicitly loads its own ignored backend/.env and
  pins PORT=3000; existing watch script retains schema synchronization guard.
- Local .env independently copied from authorized development configuration;
  CardCom local return URLs use 4200. No secrets committed.
- Frontend start:billing serves 4200 and local API endpoint uses 3000.
- Verification: Node script syntax, ignored env file, local configuration and
  diff checks. Full app not booted; shared dev database remains shared.
- User must point ngrok at 3000, update local webhook URL and restart billing.
- 2026-10-08: owner requested standard ports for Feezback diagnosis after
  stopping the chat servers; both worktrees retain independent env files.
