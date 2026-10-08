// Dedicated local billing environment; never inherit another checkout's env file.
const path = require('path');
const { spawn } = require('child_process');
const backendDir = path.resolve(__dirname, '..');
const envPath = path.join(backendDir, '.env');
const loaded = require('dotenv').config({ path: envPath, override: true });
if (loaded.error) {
  console.error('[billing] Missing backend/.env in this worktree. Configure it before starting.');
  process.exit(1);
}
const child = spawn(process.execPath, [path.join(__dirname, 'start-watch.js')], {
  cwd: backendDir,
  stdio: 'inherit',
  env: { ...process.env, PORT: '3000', DOTENV_CONFIG_PATH: envPath,
    BILLING_DEV_LEGACY_BANKING_FLOW: 'true' },
});
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', () => process.exit(1));
