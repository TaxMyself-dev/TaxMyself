const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {install}=require('./billing-recovery-faults.cjs');
test('fault adapters refuse an ordinary or wrong-project runtime before touching services',()=>{
 const saved={...process.env};let calls=0;const app={get(){calls++;throw Error('must not get services');}};
 try{
  delete process.env.BILLING_DEV_COMPLETION_ONLY;
  assert.throws(()=>install(app,'nonexistent.json'),/isolated keepintax-dev/);
  Object.assign(process.env,{BILLING_DEV_COMPLETION_ONLY:'true',DB_DATABASE:'keepintax-dev',BILLING_TASKS_PROJECT_ID:'wrong',DISABLE_SYNCHRONIZE:'true',SKIP_BOOT_SEED:'true'});
  assert.throws(()=>install(app,'nonexistent.json'),/isolated keepintax-dev/);assert.equal(calls,0);
 }finally{process.env=saved;}
});
test('fault adapters refuse invalid fixture scope before touching services',()=>{
 const saved={...process.env},dir=fs.mkdtempSync(path.join(os.tmpdir(),'billing-fault-scope-'));const file=path.join(dir,'scope.json');let calls=0;
 try{
  Object.assign(process.env,{BILLING_DEV_COMPLETION_ONLY:'true',DB_DATABASE:'keepintax-dev',BILLING_TASKS_PROJECT_ID:'keepintax-dev',DISABLE_SYNCHRONIZE:'true',SKIP_BOOT_SEED:'true'});
  fs.writeFileSync(file,JSON.stringify({database:'keepintax-dev',phase:'PDF',runId:'bad',docId:19,eventId:50,attemptId:2}));
  assert.throws(()=>install({get(){calls++;}},file),/Invalid recovery probe scope/);assert.equal(calls,0);
 }finally{process.env=saved;fs.unlinkSync(file);fs.rmdirSync(dir);}
});
