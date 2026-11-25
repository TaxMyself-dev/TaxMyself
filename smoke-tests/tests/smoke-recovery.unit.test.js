const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {main} = require('../run-signup-smoke');

for (const scenario of ['success','signup-failed','cleanup-failed','both-failed','runner-error','cleanup-start-error','both-start-error']) {
  test(`recovery state: ${scenario}`, async () => {
    const previous = {...process.env};
    const temp = fs.mkdtempSync(path.join(os.tmpdir(),'smoke-recovery-'));
    const statePath = path.join(temp,'state.json');
    const calls=[];
    Object.assign(process.env, {SMOKE_WEB_URL:'https://web.example',SMOKE_API_URL:'https://api.example',SMOKE_GCP_PROJECT:'taxmyself-prod',SMOKE_GCP_REGION:'me-west1',SMOKE_CLEANUP_JOB:'keepintax-smoke-cleanup',SMOKE_VERIFY_JOB:'keepintax-smoke-verify',SMOKE_STATE_PATH:statePath});
    const runProcess=async (_command,args,options) => {
      const before=JSON.parse(fs.readFileSync(statePath,'utf8'));
      assert.equal(before.cleanupCompleted,false);
      calls.push(args);
      if (args.includes('keepintax-smoke-cleanup') && ['cleanup-start-error','both-start-error'].includes(scenario)) throw new Error('cleanup worker unavailable');
      if (args.includes('keepintax-smoke-cleanup')) return scenario.includes('cleanup') || scenario==='both-failed' ? 1 : 0;
      if (args.includes('tests/production-login.spec.js')) return 0;
      if (args.includes('keepintax-smoke-verify')) return 0;
      if (scenario==='runner-error') throw new Error('browser could not start');
      return scenario==='signup-failed'||scenario==='both-failed'||scenario==='both-start-error' ? 1 : 0;
    };
    try {
      const result=main({runProcess,createRunId:()=> 'abcdefghijklmnop'});
      if(scenario==='success') await result;
      else await assert.rejects(result, scenario==='both-failed' ? /browser tests failed.*Smoke cleanup failed/ : scenario==='both-start-error' ? /browser tests failed.*Smoke cleanup could not start/ : /failed|could not start/);
      const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
      assert.equal(state.runId,'abcdefghijklmnop');
      assert.equal(state.cleanupCompleted,!['cleanup-failed','both-failed','cleanup-start-error','both-start-error'].includes(scenario));
      assert.equal(calls.filter(args=>args.includes('keepintax-smoke-cleanup')).length,1);
      assert.ok(!JSON.stringify(state).includes('password'));
    } finally {
      for(const key of Object.keys(process.env)) if(!(key in previous)) delete process.env[key];
      Object.assign(process.env,previous);
      fs.rmSync(statePath,{force:true}); fs.rmdirSync(temp);
    }
  });
}
