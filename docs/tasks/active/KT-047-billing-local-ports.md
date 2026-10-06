# KT-047 — Independent billing development ports

- Status: COMPLETE
- Branch: codex/billing-debt-recovery
- Scope: billing worktree only; local backend 3001, frontend 4201.
- Backend start:billing explicitly loads its own ignored backend/.env and
  pins PORT=3001; existing watch script retains schema synchronization guard.
- Local .env independently copied from authorized development configuration;
  CardCom local return URLs changed to 4201. No secrets committed.
- Frontend start:billing serves 4201 and local API endpoint uses 3001.
- Verification: Node script syntax, ignored env file, local configuration and
  diff checks. Full app not booted; shared dev database remains shared.
- User must point ngrok at 3001, update local webhook URL and restart billing.
