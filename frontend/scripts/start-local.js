// Standard local startup. Worktree ports live only in ignored local configuration.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const frontend = path.resolve(__dirname, '..');
const localDirectory = path.resolve(frontend, '../.local-ai-dev');
const configFile = path.join(localDirectory, 'ports.json');
const custom = fs.existsSync(configFile);
const ports = custom ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : { frontendPort: 4200, backendPort: 3000 };
for (const key of ['frontendPort', 'backendPort']) {
  if (!Number.isInteger(ports[key]) || ports[key] < 1024 || ports[key] > 65535) throw new Error(`Invalid local ${key}`);
}
const apiUrl = custom ? `http://127.0.0.1:${ports.backendPort}/` : 'http://localhost:3000/';
const args = process.argv.slice(2);
if (args.includes('--print-config')) {
  console.log(JSON.stringify({ ...ports, apiUrl, source: custom ? 'ignored worktree config' : 'main defaults' }));
} else if (!custom) {
  const child = spawn(process.execPath, [path.join(frontend, 'node_modules/@angular/cli/bin/ng.js'), 'serve', '-o', ...args], { cwd: frontend, stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
} else {
  startWorktree().catch(error => { console.error(error); process.exitCode = 1; });
}

async function startWorktree() {
  const { values } = require('node:util').parseArgs({ args, options: {
    port: { type: 'string' }, host: { type: 'string', default: 'localhost' },
    open: { type: 'boolean', short: 'o', default: true },
    'no-open': { type: 'boolean', default: false },
    configuration: { type: 'string', short: 'c', default: 'development' },
  } });
  const frontendPort = values.port === undefined ? ports.frontendPort : Number(values.port);
  if (!Number.isInteger(frontendPort) || frontendPort < 1024 || frontendPort > 65535) throw new Error('Invalid --port');
  process.chdir(frontend);
  const { Architect } = require('@angular-devkit/architect');
  const { WorkspaceNodeModulesArchitectHost } = require('@angular-devkit/architect/node');
  const { workspaces, schema, logging } = require('@angular-devkit/core');
  const { NodeJsSyncHost } = require('@angular-devkit/core/node');
  const source = 'src/environments/environment.ts';
  const text = fs.readFileSync(path.join(frontend, source), 'utf8');
  if (!text.includes('http://localhost:3000/')) throw new Error('Expected main API URL http://localhost:3000/ in environment.ts');
  fs.writeFileSync(path.join(localDirectory, 'environment.worktree.ts'), text.replace('http://localhost:3000/', apiUrl));
  const { workspace } = await workspaces.readWorkspace(frontend, workspaces.createWorkspaceHost(new NodeJsSyncHost()));
  workspace.projects.get('app').targets.get('build').configurations.worktree = {
    fileReplacements: [{ replace: source, with: '../.local-ai-dev/environment.worktree.ts' }],
  };
  const registry = new schema.CoreSchemaRegistry();
  registry.addPostTransform(schema.transforms.addUndefinedDefaults);
  const logger = new logging.Logger('worktree');
  logger.subscribe(entry => console.log(entry.message));
  const architect = new Architect(new WorkspaceNodeModulesArchitectHost(workspace, frontend), registry);
  const run = await architect.scheduleTarget({ project: 'app', target: 'serve', configuration: 'development' }, {
    host: values.host, port: frontendPort, open: values.open && !values['no-open'], buildTarget: 'app:build:' + values.configuration + ',worktree',
  }, { logger });
  run.output.subscribe(result => { if (result.success) console.log(`WORKTREE_READY frontend=${frontendPort} backend=${ports.backendPort}`); });
  process.on('SIGINT', () => run.stop().finally(() => process.exit()));
  await run.lastOutput;
}
