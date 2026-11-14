'use strict';
// Local development only. Never installs dependencies, edits .env, applies SQL,
// starts example workers, deploys, or stops existing services.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function optionsOf(args) {
  const options = { check: false, help: false };
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--check') options.check = true;
    else if (arg !== '--infrastructure-only') throw new Error('Unknown option: ' + arg);
  }
  return options;
}

function localDockerHost(host) {
  return /^(npipe:\/\/|unix:\/\/)/i.test(host) || /^tcp:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+\/?$/i.test(host);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function command(exe, args, settings = {}) {
  const result = spawnSync(exe, args, { windowsHide: true, encoding: 'utf8', timeout: 180000, ...settings });
  if (result.error || result.status !== 0) throw new Error(path.basename(exe) + ' failed. ' + (settings.failureHint || 'Check the local command or log.'));
  return result.stdout || '';
}

async function responds(url, statuses = [200], headers = {}) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(2000), redirect: 'manual' });
    await response.body?.cancel();
    return statuses.includes(response.status);
  } catch { return false; }
}

async function waitFor(name, check, seconds) {
  console.log('[WAIT] ' + name);
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (await check()) { console.log('[READY] ' + name); return; }
    await delay(1500);
  }
  throw new Error(name + ' did not become ready; check Docker Desktop and Langfuse container logs.');
}

async function main(args = process.argv.slice(2)) {
  const options = optionsOf(args);
  if (options.help) {
    console.log('start-ai.cmd [--check] [--help]\nStarts only local Docker Desktop and the existing Langfuse stack.\n--check: read-only Docker/Langfuse readiness. Start frontend and backend yourself.');
    return;
  }
  const langfuseDir = process.env.LANGFUSE_DIR || path.join(os.homedir(), 'langfuse-local');
  for (const file of ['docker-compose.yml', '.env']) {
    if (!fs.existsSync(path.join(langfuseDir, file))) throw new Error('Missing existing Langfuse configuration: ' + file + ' in ' + langfuseDir);
  }
  const docker = command('where.exe', ['docker'], { timeout: 5000 }).trim().split(/\r?\n/)[0];
  const context = command(docker, ['context', 'inspect'], { timeout: 10000 });
  const host = process.env.DOCKER_HOST || JSON.parse(context)[0]?.Endpoints?.docker?.Host || '';
  if (!localDockerHost(host)) throw new Error('Refusing to start services on a non-local Docker endpoint.');
  const dockerReady = () => spawnSync(docker, ['info', '--format', '{{.ServerVersion}}'], { windowsHide: true, stdio: 'ignore', timeout: 4000 }).status === 0;
  const langfuseReady = () => responds('http://localhost:3100/api/public/health');
  if (options.check) {
    const checks = [['Docker', dockerReady()], ['Langfuse :3100', await langfuseReady()]];
    for (const [name, ready] of checks) console.log((ready ? '[READY] ' : '[DOWN] ') + name);
    if (checks.some(([, ready]) => !ready)) process.exitCode = 1;
    return;
  }
  if (!dockerReady()) {
    const desktop = path.resolve(path.dirname(docker), '..', '..', 'Docker Desktop.exe');
    if (!fs.existsSync(desktop)) throw new Error('Docker Desktop executable not found. Start Docker Desktop, then retry.');
    command('powershell.exe', ['-NoProfile', '-Command', "Start-Process -FilePath '" + desktop.replace(/'/g, "''") + "' -WindowStyle Hidden"], { timeout: 10000 });
    await waitFor('Docker Desktop', dockerReady, 120);
  }
  // Compose also repairs stopped workers/dependencies when the web UI is up.
  console.log('[START/REUSE] Existing local Langfuse compose stack');
  command(docker, ['compose', 'up', '-d', '--wait', '--wait-timeout', '180'], { cwd: langfuseDir, timeout: 210000, failureHint: 'Check Docker Desktop and the existing local Langfuse compose configuration.' });
  await waitFor('Langfuse http://localhost:3100', langfuseReady, 180);
  console.log('[READY] Traces: http://localhost:3100');
}

module.exports = { optionsOf, localDockerHost, responds };
if (require.main === module) main().catch(error => { console.error('[FAILED] ' + error.message); process.exitCode = 1; });
