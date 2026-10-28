// Local development launcher. Intake runs automatically; no schema sync or seeds.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const backend = path.resolve(__dirname, '..');
const envFile = path.join(backend, '.env');
const loaded = require('dotenv').config({ path: envFile });
if (loaded.error || process.env.DB_DATABASE !== 'keepintax-dev') {
  console.error('Receiver requires this worktree environment and keepintax-dev');
  process.exit(1);
}
const log = fs.openSync(path.join(backend, '.lychee-receiver.log'), 'a');
const child = spawn(process.execPath, [path.join(backend, 'dist/main.js')], {
  cwd: backend, stdio: ['ignore', log, log],
  env: { ...process.env, PORT: '3000', DISABLE_SYNCHRONIZE: 'true', SKIP_BOOT_SEED: 'true',
    LYCHEE_CHANNEL_ID: process.env.LYCHEE_CHANNEL_ID || '73971d88-8e11-4f58-958c-7472129063e7' },
});
child.on('exit', code => { fs.closeSync(log); process.exitCode = code || 0; });
child.on('error', () => { console.error('Receiver launch failed'); process.exitCode = 1; });
console.log('Development backend starting on port 3000; Lychee intake runs automatically.');
