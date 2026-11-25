const {test}=require("node:test");
const assert=require("node:assert/strict");
const http=require("node:http");
const {startServer}=require("../src/start.cjs");
test("does not listen or announce ready until warmup completes", async t=>{
 let finish;const logs=[];let closed=0;
 const render={warmup:()=>new Promise(r=>finish=r),close:async()=>closed++};
 const server=http.createServer();t.after(()=>new Promise(r=>server.close(r)));
 const pending=startServer({render,server,port:0,host:"127.0.0.1",warmup:true,logger:x=>logs.push(JSON.parse(x))});
 assert.equal(server.listening,false);assert.equal(logs.length,0);
 finish();await pending;assert.equal(server.listening,true);assert.equal(logs[0].warmup,true);assert.equal(closed,0);
});
test("failed warmup closes renderer without publishing a listener",async()=>{
 let closed=0;const server=http.createServer();
 const render={warmup:async()=>{throw Error("failed");},close:async()=>closed++};
 await assert.rejects(startServer({render,server,port:0,host:"127.0.0.1",warmup:true,logger:()=>{throw Error("unexpected ready");}}),/failed/);
 assert.equal(server.listening,false);assert.equal(closed,1);
});
test("explicit opt out skips warmup",async t=>{
 const server=http.createServer();t.after(()=>new Promise(r=>server.close(r)));
 const render={warmup:async()=>{throw Error("unexpected warmup");},close:async()=>{}};
 await startServer({render,server,port:0,host:"127.0.0.1",warmup:false,logger:()=>{}});
 assert.equal(server.listening,true);
});
