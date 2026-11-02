// Isolated, compiled dev worker. No watch/restart loop and no copied credentials.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const backend = path.resolve(__dirname, '..');
const loaded = require('dotenv').config({ path: path.join(backend, '.env'), override: true });
if (loaded.error) throw new Error('Missing worktree backend/.env');
if (process.env.DB_DATABASE !== 'keepintax-dev') throw new Error('Refusing non-dev database');
Object.assign(process.env, { PORT: '3000', DISABLE_SYNCHRONIZE: 'true', SKIP_BOOT_SEED: 'true',
  BILLING_DEV_COMPLETION_ONLY: 'true', DOTENV_CONFIG_PATH: path.join(backend, '.env') });
const entry = path.join(backend, 'dist/main.js');
if (!fs.existsSync(entry)) throw new Error('Build backend before starting the compiled completion worker');
const { assertDevCompletionEnvironment } = require(path.join(backend, 'dist/billing/domain/dev-completion-mode'));
assertDevCompletionEnvironment();
const child = spawn(process.execPath, [entry], { cwd: backend, env: process.env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
child.on('error', () => process.exit(1));
