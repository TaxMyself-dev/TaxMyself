const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { performance } = require('perf_hooks');

const TIMING_PREFIX = '[startup-timing] ';
const PROFILE_PREFIX = '[startup-profile] ';

function validateProfileEnvironment(environment) {
  const database = environment.DB_DATABASE;
  if (!database) throw new Error('DB_DATABASE is required; refusing to start.');
  if (/prod|production|copy/i.test(database)) {
    throw new Error(
      `DB_DATABASE=${JSON.stringify(
        database,
      )} looks production-like; refusing to start.`,
    );
  }
  if (database !== 'keepintax-dev') {
    throw new Error(
      'DB_DATABASE must be exactly keepintax-dev; refusing to start.',
    );
  }
  return {
    ...environment,
    DISABLE_SYNCHRONIZE: 'true',
    SKIP_BOOT_SEED: 'false',
    STARTUP_TIMING: 'true',
  };
}

function parseTimingLine(line) {
  const index = line.indexOf(TIMING_PREFIX);
  if (index < 0) return null;
  try {
    const parsed = JSON.parse(line.slice(index + TIMING_PREFIX.length));
    return parsed && typeof parsed.event === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeMeasurements(runs) {
  const byEvent = new Map();
  for (const run of runs) {
    for (const event of run) {
      const value = event.duration_ms ?? event.elapsed_ms;
      if (typeof value !== 'number') continue;
      const values = byEvent.get(event.event) ?? [];
      values.push(value);
      byEvent.set(event.event, values);
    }
  }

  const summary = {};
  for (const [event, values] of byEvent) {
    const sorted = [...values].sort((a, b) => a - b);
    summary[event] = {
      samples: sorted.length,
      min_ms: Number(sorted[0].toFixed(3)),
      median_ms: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
      max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
    };
  }
  return summary;
}

function runSupervisedProcess(options) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    options.onSpawn?.(child.pid);
    const lines = [];
    let buffer = '';
    let outcome = null;

    const terminate = () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    };
    const onSignal = (signal) => {
      outcome = new Error(`Profile supervisor received ${signal}.`);
      terminate();
    };
    const onSigint = () => onSignal('SIGINT');
    const onSigterm = () => onSignal('SIGTERM');
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    const timer = setTimeout(() => {
      outcome = new Error(
        `Profile child timed out after ${options.timeoutMs}ms.`,
      );
      terminate();
    }, options.timeoutMs);

    const consume = (text) => {
      buffer += text;
      const completeLines = buffer.split(/\r?\n/);
      buffer = completeLines.pop() ?? '';
      for (const line of completeLines) {
        lines.push(line);
        options.onLine?.(line, child);
        if (!outcome && options.isComplete?.(line)) {
          outcome = lines;
          terminate();
        }
      }
    };

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      consume(chunk.toString());
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', (error) => {
      outcome = error;
      terminate();
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
      if (buffer) {
        lines.push(buffer);
        options.onLine?.(buffer, child);
      }
      options.onExit?.(code, signal);
      if (outcome instanceof Error) reject(outcome);
      else if (Array.isArray(outcome)) resolve(outcome);
      else
        reject(
          new Error(
            `Profile child exited before completion (code=${code}, signal=${signal}).`,
          ),
        );
    });
  });
}

function findCompiledMain() {
  const candidates = [
    path.resolve('dist/main.js'),
    path.resolve('dist/src/main.js'),
  ];
  const main = candidates.find((candidate) => fs.existsSync(candidate));
  if (!main) throw new Error('Compiled main.js was not found after build.');
  return main;
}

async function findFreePort() {
  const net = require('net');
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function runMeasurement(runNumber, mainFile, environment, timeoutMs) {
  const port = await findFreePort();
  const spawnedAt = performance.now();
  let requestSent = false;
  const events = [];
  const register = path.resolve('scripts/register-dist-paths.js');

  await runSupervisedProcess({
    command: process.execPath,
    args: ['-r', register, mainFile],
    cwd: process.cwd(),
    env: {
      ...environment,
      PORT: String(port),
      STARTUP_PROFILE_DIST_SOURCE_ROOT: path.dirname(mainFile),
    },
    timeoutMs,
    onLine(line) {
      const event = parseTimingLine(line);
      if (!event) return;
      events.push(event);
      if (event.event === 'startup.total_ready' && !requestSent) {
        requestSent = true;
        const spawnEvent = {
          event: 'process.spawn_to_ready',
          duration_ms: Number((performance.now() - spawnedAt).toFixed(3)),
          run: runNumber,
        };
        events.push(spawnEvent);
        console.log(`${PROFILE_PREFIX}${JSON.stringify(spawnEvent)}`);
        http
          .get({ host: '127.0.0.1', port, path: '/' }, (response) =>
            response.resume(),
          )
          .on('error', (error) =>
            console.error(
              `[startup-profile] first-request probe failed: ${error.message}`,
            ),
          );
      }
    },
    isComplete(line) {
      return parseTimingLine(line)?.event === 'http.first_request.complete';
    },
  });
  return events;
}

async function main() {
  try {
    try {
      require('dotenv').config();
    } catch {
      /* validation below remains fail-closed */
    }
    const environment = validateProfileEnvironment(process.env);
    const runs = Number.parseInt(process.env.STARTUP_PROFILE_RUNS || '3', 10);
    const timeoutMs = Number.parseInt(
      process.env.STARTUP_PROFILE_TIMEOUT_MS || '120000',
      10,
    );
    if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
      throw new Error('STARTUP_PROFILE_RUNS must be an integer from 1 to 20.');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) {
      throw new Error(
        'STARTUP_PROFILE_TIMEOUT_MS must be an integer of at least 1000.',
      );
    }

    if (process.env.STARTUP_PROFILE_SKIP_BUILD !== 'true') {
      const nestCli = path.resolve('node_modules/@nestjs/cli/bin/nest.js');
      const build = spawnSync(process.execPath, [nestCli, 'build'], {
        cwd: process.cwd(),
        env: environment,
        stdio: 'inherit',
        timeout: 300000,
        windowsHide: true,
      });
      if (build.error) throw build.error;
      if (build.status !== 0)
        throw new Error(`Backend build failed with exit code ${build.status}.`);
    }

    const mainFile = findCompiledMain();
    const measurements = [];
    for (let run = 1; run <= runs; run++) {
      console.log(
        `${PROFILE_PREFIX}${JSON.stringify({ event: 'run.start', run, runs })}`,
      );
      measurements.push(
        await runMeasurement(run, mainFile, environment, timeoutMs),
      );
    }
    console.log(
      `${PROFILE_PREFIX}${JSON.stringify({
        event: 'startup_profile.summary',
        runs,
        metrics: summarizeMeasurements(measurements),
      })}`,
    );
  } catch (error) {
    console.error(`[startup-profile] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseTimingLine,
  runSupervisedProcess,
  summarizeMeasurements,
  validateProfileEnvironment,
};

if (require.main === module) main();
