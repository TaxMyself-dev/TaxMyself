// Canonical entry point for local dev with live-reload (2026-08-17 — dev-
// tooling hardening against the synchronize-clobber bug class; see
// app.module.ts's DISABLE_SYNCHRONIZE comment and
// docs/redesign/schema-drift.md Gap 7 for the incidents this closes).
//
// Sets DISABLE_SYNCHRONIZE=true before spawning `nest start --watch`, so a
// long-lived watched process against the shared keepintax-dev database can
// no longer silently ALTER/drop-and-recreate schema on every restart —
// exactly the mechanism that clobbered business.businessField during a
// prior session (an entity column type change → TypeORM drop+recreate →
// every existing row silently backfilled with the new column's default,
// zero review).
//
// Plain Node child_process, not a `VAR=value command` shell prefix,
// deliberately: that syntax does NOT work through npm's default Windows
// script-shell (cmd.exe) — confirmed directly; `child_process.exec` fails
// with "'DISABLE_SYNCHRONIZE' is not recognized as an internal or external
// command." The existing `start:dev` script already has this exact bug
// (unrelated to this change, not fixed here — out of scope). This script
// sidesteps it entirely by setting the env var in Node itself before
// spawning the child process, which works identically on every platform.
//
// Escape hatch — genuinely need synchronize once (e.g. bootstrapping a
// fresh/scratch schema from nothing, the way the seeder create-only-path
// verification did): don't use this script. Run the nest CLI directly with
// DISABLE_SYNCHRONIZE left unset/false for that one boot instead, e.g. from
// Git Bash:
//   DISABLE_SYNCHRONIZE=false DB_DATABASE=<scratch-db-name> npx nest start
// or from PowerShell:
//   $env:DISABLE_SYNCHRONIZE = 'false'; $env:DB_DATABASE = '<scratch-db-name>'; npx nest start
// — a deliberate, named one-off, not an ambient default.
const { spawn } = require('child_process');
const fs = require('node:fs');
const path = require('node:path');
const portConfigPath = path.resolve(__dirname, '../../.local-ai-dev/ports.json');
const localPorts = fs.existsSync(portConfigPath) ? JSON.parse(fs.readFileSync(portConfigPath, 'utf8')) : null;
if (localPorts && (!Number.isInteger(localPorts.backendPort) || localPorts.backendPort < 1024 || localPorts.backendPort > 65535)) {
  throw new Error('Invalid backendPort in .local-ai-dev/ports.json');
}
const envPath = path.resolve(__dirname, '../.env');
const fileEnv = fs.existsSync(envPath) ? require('dotenv').parse(fs.readFileSync(envPath)) : {};
if (localPorts && (!Number.isInteger(localPorts.frontendPort) || localPorts.frontendPort < 1024 || localPorts.frontendPort > 65535)) {
  throw new Error('Invalid frontendPort in .local-ai-dev/ports.json');
}
const origins = localPorts ? [...new Set([
  ...(process.env.AGENT_APP_ORIGINS || fileEnv.AGENT_APP_ORIGINS || '').split(',').filter(Boolean),
  'http://localhost:' + localPorts.frontendPort, 'http://127.0.0.1:' + localPorts.frontendPort,
])].join(',') : undefined;
const childEnv = { ...process.env, DISABLE_SYNCHRONIZE: 'true', ...(localPorts && { PORT: String(localPorts.backendPort), AGENT_APP_ORIGINS: origins }) };
if (process.argv.includes('--print-config')) {
  console.log(JSON.stringify({ backendPort: Number(childEnv.PORT || fileEnv.PORT || 8080), source: localPorts ? 'ignored worktree config' : 'process/environment', synchronize: false }));
  process.exit(0);
}


const child = spawn('npx', ['nest', 'start', '--watch'], {
  stdio: 'inherit',
  shell: true,
  env: childEnv,
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[start-watch] Failed to spawn nest start --watch:', err);
  process.exit(1);
});
