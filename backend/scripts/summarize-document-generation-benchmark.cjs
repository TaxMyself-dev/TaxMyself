const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),raw=path.join(root,'.test-tmp/document-speed-2026-11-25');
const parsePdf=require('pdf-parse');
const {hasCompletePdfSignature}=require('../dist/documents/pdf/fillfaster-signer.service');
const read=name=>JSON.parse(fs.readFileSync(path.join(raw,name),'utf8'));
const mean=a=>a.reduce((sum,x)=>sum+x,0)/a.length;
const median=a=>{a=[...a].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2]+a[a.length/2-1])/2;};
function summarize(rows){return [...new Set(rows.map(x=>x.scenario))].map(scenario=>{
  const group=variant=>rows.filter(x=>x.scenario===scenario&&x.variant===variant);
  const before=group('before'),after=group('after');
  const values=group=>group.map(x=>x.totalMs);
  const b=values(before),a=values(after);
  const pairs=before.map(x=>{const matching=after.find(y=>y.repeat===x.repeat);return {repeat:x.repeat,beforeMs:x.totalMs,afterMs:matching.totalMs,changePct:100*(x.totalMs-matching.totalMs)/x.totalMs};});
  return {scenario,repeats:b.length,beforeMeanMs:mean(b),afterMeanMs:mean(a),
    beforeMedianMs:median(b),afterMedianMs:median(a),improvementPct:100*(mean(b)-mean(a))/mean(b),
    beforeRangeMs:[Math.min(...b),Math.max(...b)],afterRangeMs:[Math.min(...a),Math.max(...a)],
    fasterPairs:pairs.filter(x=>x.afterMs<x.beforeMs).length,pairs,
    counters:{before:before.map(x=>x.metrics),after:after.map(x=>x.metrics)}};
});}
async function main(){
  const diagnostic=read('live-diagnostic.json'),remaining=read('live-remaining.json'),local=read('local.json');
  assert.equal(diagnostic.status,'passed');assert.equal(remaining.status,'passed');assert.equal(local.status,'passed');
  const liveRows=[...diagnostic.rows,...remaining.rows];assert.equal(liveRows.length,12);assert.equal(local.rows.length,60);
  assert.equal(fs.readFileSync(path.join(raw,'live-signing-requests.jsonl'),'utf8').trim().split('\n').length,24);
  const livePdfFiles=fs.readdirSync(raw).filter(name=>/^(diagnostic|remaining)-.*\.pdf$/.test(name));assert.equal(livePdfFiles.length,24);
  const pdfChecks=[];
  for(const file of livePdfFiles){
    const bytes=fs.readFileSync(path.join(raw,file));assert(hasCompletePdfSignature(bytes),`Signature envelope missing: ${file}`);
    const parsed=await parsePdf(bytes);
    assert(parsed.numpages>0,`No pages: ${file}`);
    const allocated=/allocation/.test(file) && !/no-allocation/.test(file);
    if(allocated)assert(parsed.text.includes('123456789'),`Allocation number absent: ${file}`);
    assert(parsed.text.includes('English'),`Synthetic line text absent: ${file}`);
    pdfChecks.push({file,pages:parsed.numpages,signatureEnvelope:true,allocationExpected:allocated,allocationPresent:parsed.text.includes('123456789')});
  }
  for(const row of local.rows){
    if(!row.scenario.includes('preview')){assert.equal(row.metrics.signCalls,2);assert.equal(row.metrics.commit,1);}
    if(row.variant==='after'&&row.scenario==='receipt-email-queued'){
      assert.equal(row.metrics.pdfRedownload||0,0);assert.equal(row.metrics.mail||0,0);assert.equal(row.metrics.enqueue,1);assert.equal(row.metrics.kick,1);
    }
    if(row.variant==='after'&&row.scenario==='warm-logo-preview')assert.equal(row.metrics.logoDownload||0,0);
  }
  assert.equal(local.failureChecks.length,8);
  const report={date:'2026-11-25',timezone:'Asia/Jerusalem',beforeRevision:local.beforeRevision,afterRevision:local.afterRevision,
    comparisons:{liveSigner:summarize(liveRows),controlledLocal:summarize(local.rows)},
    liveSignerCalls:24,signatureEnvelopeChecks:24,pdfChecks,localFailureChecks:local.failureChecks,
    environment:local.environment,harnessSha256:local.harnessSha256,
    caveats:[
      'Real Chromium and real before/after orchestration; no real DB/storage/mail/SHAAM or Cloud Run.',
      'Live signer table: only 2 paired repetitions per scenario, not a statistical significance or p95 claim.',
      'Live cases retained up to 6 browser instances over the three cases. Do not infer precise production speedups.',
      'Initial live baseline includes the first provider connection; later paired order alternates.',
      'Final controlled local run is bounded to two comparison browsers and alternates order; 3 repetitions per scenario.',
      'Controlled local sign=500ms, logo storage=120ms, each upload=100ms, SMTP=500ms, business lookup=5ms; these are assumptions.',
      'Queue-on comparison uses enqueue/commit/kick spies. It is not a MySQL durability/scheduler integration test; table remains unapplied/queue disabled.',
      'Allocation cases use a stored synthetic number. Actual tax-authority allocation request time is excluded.',
      'PDF checks validate envelope presence/page parsing/content, not cryptographic certificate trust.',
      'Preliminary local runs were interrupted after detecting accumulated browser resources; their results are preserved separately and excluded from final local summary.',
    ],rawLiveRows:liveRows,rawLocalRows:local.rows};
  const evidence=path.join(root,'docs/features/evidence/document-generation-speed-2026-11-25.json');
  fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');
  function table(summary){return ['| Scenario | Before mean (s) | After mean (s) | Reduction | Faster pairs |',
    '| --- | ---: | ---: | ---: | ---: |',...summary.map(x=>`| ${x.scenario} | ${(x.beforeMeanMs/1000).toFixed(3)} | ${(x.afterMeanMs/1000).toFixed(3)} | ${x.improvementPct.toFixed(1)}% | ${x.fasterPairs}/${x.repeats} |`)].join('\n');}
  let text=`# Document generation before/after measurement — 2026-11-25\n\n`+
    `Measured source revisions: before \`${report.beforeRevision}\`, after \`${report.afterRevision}\`.\n`+
    `The after application source was unchanged during measurement; only diagnostic scripts/docs were added.\n\n`+
    `## Actual FillFaster signing, isolated application boundaries\n\n`+
    `Exactly 24 authorized synthetic signature requests succeeded, no retries: three scenarios, two original/copy files, two variants, two repetitions.\n`+
    `Actual createDoc/finalizeAllocation/model preparation and local Chromium were used. Database, upload, logo storage and mail remained isolated simulations.\n\n`+
    table(report.comparisons.liveSigner)+'\n\n'+
    `The large allocated document improved in both pairs. Short-case differences are small relative to run-to-run ranges; no consistent ordinary-issuance speedup is established.\n`+
    `Original signing already overlaps copy rendering in the baseline. When that signing finishes first, allowing copy signing in parallel cannot shorten that segment.\n\n`+
    `## Controlled local matrix\n\n`+
    `Real Chromium, ten scenarios, three repetitions per variant (60 timed successful runs). Controlled simulated signing/storage/mail latency, not production totals.\n\n`+
    table(report.comparisons.controlledLocal)+'\n\n'+
    `Negative reduction values mean the after variant was slower in that sample; they are retained. The queue row measures opt-in creation-response latency, not completion of email delivery.\n\n`+
    `## Behavior and output checks\n\n`+
    `- All 24 live signed outputs had complete PDF signature envelopes and parsed into pages; synthetic content and allocation-number presence were verified. Certificate trust was not tested.\n`+
    `- Eight before/after failure checks passed: signing quota rejection, partial upload, corrupt image and unresolved allocation. None committed or sent mail; corrupt images failed before signing; unresolved allocation failed before rendering.\n`+
    `- Queue-on after runs performed no PDF redownload or synchronous SMTP, and dispatched only after the simulated commit. Warm logo previews performed no storage download.\n`+
    `- No live document numbering, DB writes/DDL, tax-authority requests, cloud service inspection, upload, SMTP, main integration or deployment.\n\n`+
    `## Limits and reproducibility\n\n`+report.caveats.map(x=>'- '+x).join('\n')+'\n\n'+
    `Harness: [benchmark-document-generation.cjs](../../backend/scripts/benchmark-document-generation.cjs).\n`+
    `Sanitized raw timings/counters, per-pair ranges, PDF checks and source hash: [evidence JSON](evidence/document-generation-speed-2026-11-25.json).\n`+
    `Synthetic PDFs and the signing request ledger are retained under the ignored local \`.test-tmp/document-speed-2026-11-25/\` directory.\n\n`+
    'Commands from `backend/`:\n\n```powershell\n'+
    'node scripts/benchmark-document-generation.cjs --live=diagnostic\n'+
    'node scripts/benchmark-document-generation.cjs --live=remaining\n'+
    'node --check scripts/benchmark-document-generation.cjs\n'+
    'node scripts/benchmark-document-generation.cjs\n'+
    'node scripts/summarize-document-generation-benchmark.cjs\n```\n\n'+
    `All final commands exited 0. Live phases consumed 4 then 20 calls. Do not rerun paid phases: the fixed ledger rejects reuse/over-budget calls.\n`+
    `Two preliminary local invocations exited 1 after intentional interruption; the second preserved measurements as \`local-preliminary-resource-diagnostic.json\`.\n`+
    `Final local harness hash: \`${local.harnessSha256}\`. The live phases preceded resource-window refinement and must not be described as a single final-harness run.\n`;
  const doc=path.join(root,'docs/features/document-generation-speed-benchmark-2026-11-25.md');fs.writeFileSync(doc,text);
  console.log(JSON.stringify({live:report.comparisons.liveSigner.map(({scenario,beforeMeanMs,afterMeanMs,improvementPct,fasterPairs})=>({scenario,beforeMeanMs,afterMeanMs,improvementPct,fasterPairs})),
    local:report.comparisons.controlledLocal.map(({scenario,beforeMeanMs,afterMeanMs,improvementPct,fasterPairs})=>({scenario,beforeMeanMs,afterMeanMs,improvementPct,fasterPairs})),
    liveRequests:24,pdfChecks:24,failureChecks:8,report:doc},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
