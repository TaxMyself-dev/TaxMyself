'use strict';
// Local development only. Never installs dependencies, edits .env, applies SQL,
// starts example workers, deploys, or stops existing services.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseEnv } = require('node:util');
const { spawn, spawnSync } = require('node:child_process');

function optionsOf(args) {
  const options = { backendPort: 3000, frontendPort: 4200, check: false, infrastructureOnly: false, noBuild: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--infrastructure-only') options.infrastructureOnly = true;
    else if (arg === '--no-build') options.noBuild = true;
    else if (arg === '--backend-port' || arg === '--frontend-port') {
      const port = Number(args[++i]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port.');
      options[arg === '--backend-port' ? 'backendPort' : 'frontendPort'] = port;
    } else throw new Error('Unknown option: ' + arg);
  }
  if (new Set([options.backendPort, options.frontendPort, 3100]).size !== 3) throw new Error('Backend, frontend and Langfuse ports must differ.');
  return options;
}

function localDockerHost(host) {
  return /^(npipe:\/\/|unix:\/\/)/i.test(host) || /^tcp:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+\/?$/i.test(host);
}

function developmentEnv(fileEnv, options) {
  if (fileEnv.DB_DATABASE !== 'keepintax-dev') throw new Error('Refusing to start the backend: backend/.env must select keepintax-dev. No database was contacted.');
  for (const key of ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY']) {
    if (!fileEnv[key]) throw new Error('Missing ' + key + ' in the existing backend environment. No credentials are generated.');
  }
  const origins = new Set((fileEnv.AGENT_APP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
  origins.add('http://localhost:' + options.frontendPort);
  return { ...fileEnv, NODE_ENV: 'development', DISABLE_SYNCHRONIZE: 'true', SKIP_BOOT_SEED: 'true',
    LANGFUSE_BASE_URL: 'http://localhost:3100', LANGFUSE_TRACING_ENVIRONMENT: 'development',
    AGENT_APP_ORIGINS: [...origins].join(','), PORT: String(options.backendPort) };
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(__dirname, '..');
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

// Angular's SPA fallback requires the same HTML Accept header as a browser.
const frontendResponds = (baseUrl) => responds(baseUrl + '/dev/agent', [200], { Accept: 'text/html' });

async function waitFor(name, check, seconds, child) {
  console.log('[WAIT] ' + name);
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (await check()) { console.log('[READY] ' + name); return; }
    if (child && child.exitCode !== null) throw new Error(name + ' exited; see .local-ai-dev logs.');
    await delay(1500);
  }
  throw new Error(name + ' did not become ready; see .local-ai-dev logs.');
}

function npmBuild(directory) {
  const cli = path.join(directory, 'node_modules/npm/bin/npm-cli.js');
  // npm is normally installed alongside node on Windows, independently per
  // worktree dependencies remain in each package's own node_modules.
  const globalCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const npm = fs.existsSync(cli) ? cli : globalCli;
  if (!fs.existsSync(npm)) throw new Error('npm CLI not found alongside Node. Run the documented npm builds manually and use --no-build.');
  console.log('[BUILD] ' + path.relative(root, directory));
  command(process.execPath, [npm, 'run', 'build'], { cwd: directory, stdio: 'inherit' });
}

function startBackground(name, args, cwd, env, port) {
  const logDir = path.join(root, '.local-ai-dev');
  fs.mkdirSync(logDir, { recursive: true });
  const statePath = path.join(logDir, name + '-' + port + '.json');
  try {
    const prior = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (Number.isInteger(prior.pid) && prior.pid > 0 && prior.cwd === cwd && JSON.stringify(prior.args) === JSON.stringify(args)) {
      process.kill(prior.pid, 0); // Existence check only; sends no signal.
      console.log('[REUSE STARTING] ' + name + ' PID ' + prior.pid);
      return { pid: prior.pid, exitCode: null };
    }
  } catch { /* Missing/stopped prior process; start a new one. */ }
  const logPath = path.join(logDir, name + '.log');
  const fd = fs.openSync(logPath, 'a');
  let child;
  try { child = spawn(process.execPath, args, { cwd, env, windowsHide: true, detached: true, stdio: ['ignore', fd, fd] }); }
  finally { fs.closeSync(fd); }
  child.on('error', () => console.error('[FAILED] ' + name + '; see ' + logPath));
  child.unref();
  fs.writeFileSync(statePath, JSON.stringify({ pid: child.pid, cwd, args }));
  console.log('[START] ' + name + ' PID ' + child.pid + ' log: ' + logPath);
  return child;
}

async function main(args = process.argv.slice(2)) {
  const options = optionsOf(args);
  if (options.help) {
    console.log('start-ai.cmd [--check] [--infrastructure-only] [--no-build] [--backend-port 3000] [--frontend-port 4200]\nStarts local Docker/Langfuse, builds the agent and Nest, then starts backend watch and Angular.\n--check: read-only readiness checks; --infrastructure-only: Docker/Langfuse only.\nExisting services are reused, never killed. .env files and databases are not changed.');
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
  const backendUrl = 'http://localhost:' + options.backendPort;
  const frontendUrl = 'http://localhost:' + options.frontendPort;
  const backendReady = () => responds(backendUrl + '/api/agent/fn/readAgentSession', [401, 403]);
  const frontendReady = () => frontendResponds(frontendUrl);
  const langfuseReady = () => responds('http://localhost:3100/api/public/health');
  if (options.check) {
    const checks = [['Docker', dockerReady()], ['Langfuse :3100', await langfuseReady()], ['Backend :' + options.backendPort, await backendReady()], ['Frontend :' + options.frontendPort, await frontendReady()]];
    for (const [name, ready] of checks) console.log((ready ? '[READY] ' : '[DOWN] ') + name);
    if (checks.some(([, ready]) => !ready)) process.exitCode = 1;
    return;
  }
  let env;
  const backend = path.join(root, 'backend');
  const agent = path.join(backend, 'agent');
  const frontend = path.join(root, 'frontend');
  if (!options.infrastructureOnly) {
    if (typeof parseEnv !== 'function') throw new Error('Use the project Node 24 runtime.');
    const envFile = path.join(backend, '.env');
    if (!fs.existsSync(envFile)) throw new Error('Existing backend/.env is missing; it is never created or overwritten.');
    env = developmentEnv({ ...parseEnv(fs.readFileSync(envFile, 'utf8')), ...process.env }, options);
    for (const directory of [backend, agent, frontend]) {
      if (!fs.existsSync(path.join(directory, 'node_modules'))) throw new Error('Install dependencies independently in ' + directory + ' first.');
    }
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
  if (options.infrastructureOnly) return;
  const existingBackend = await backendReady();
  if (!options.noBuild && !existingBackend) { npmBuild(agent); npmBuild(backend); }
  if (!fs.existsSync(path.join(agent, 'dist/agent-http.mjs'))) throw new Error('Agent bundle missing; run again without --no-build.');
  if (!existingBackend) {
    const child = startBackground('backend', [path.join(backend, 'node_modules/@nestjs/cli/bin/nest.js'), 'start', '--watch'], backend, env, options.backendPort);
    await waitFor('Backend ' + backendUrl, backendReady, 180, child);
  } else console.log('[REUSE] Backend; restart your existing process if it predates the code fix.');
  if (!(await frontendReady())) {
    const child = startBackground('frontend', [path.join(frontend, 'node_modules/@angular/cli/bin/ng.js'), 'serve', '--host', '127.0.0.1', '--port', String(options.frontendPort)], frontend, process.env, options.frontendPort);
    await waitFor('Frontend ' + frontendUrl, frontendReady, 600, child);
  } else console.log('[REUSE] Frontend :' + options.frontendPort);
  console.log('[READY] Chat: ' + frontendUrl + '/dev/agent?api=' + encodeURIComponent(backendUrl + '/'));
  console.log('[READY] Traces: http://localhost:3100');
}

module.exports = { optionsOf, localDockerHost, developmentEnv, responds, frontendResponds };
if (require.main === module) main().catch(error => { console.error('[FAILED] ' + error.message); process.exitCode = 1; });
