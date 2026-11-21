import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

// An actual child process exercises Node's unhandledRejection event without
// installing process-global listeners inside Jest or hiding test failures.
const modulePath = path.join(__dirname, 'agent-background-context.ts');
const child = (program: string) =>
  spawnSync(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      '-e',
      `const {installAgentRejectionGuard,withAgentBackgroundContext}=require(${JSON.stringify(
        modulePath,
      )});
   withAgentBackgroundContext(() => installAgentRejectionGuard({error: (tag) => console.log(tag)}, 'agent-package-sentinel'));
   ${program}`,
    ],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 15000 },
  );

describe('agent background rejection isolation', () => {
  it('survives the reported AggregateError with only internal node:net frames', () => {
    const result = child(`
      withAgentBackgroundContext(() => {
        setTimeout(() => {
          const error = new AggregateError([new Error('ECONNREFUSED ::1:3100'), new Error('ECONNREFUSED 127.0.0.1:3100')]);
          error.stack = 'AggregateError: connect ECONNREFUSED\\n at internalConnectMultiple (node:net:1134:18)';
          Promise.reject(error);
        }, 0);
      });
      setTimeout(() => console.log('SERVER_STILL_ALIVE'), 80);
    `);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('AGENT_UNHANDLED_REJECTION');
    expect(result.stdout).toContain('SERVER_STILL_ALIVE');
  });

  it('still fails for an unrelated backend rejection', () => {
    const result = child(
      `Promise.reject(new Error('OUTSIDE_AGENT_SENTINEL'));`,
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('OUTSIDE_AGENT_SENTINEL');
  });

  it('retains stack attribution for agent work from outside an active request', () => {
    const result = child(`
      const error = new Error('agent task');
      error.stack = 'Error: agent task\\n at agent-package-sentinel/task.js:1';
      Promise.reject(error);
      setTimeout(() => console.log('SERVER_STILL_ALIVE'), 80);
    `);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SERVER_STILL_ALIVE');
  });
});
