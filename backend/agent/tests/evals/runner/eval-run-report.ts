import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { Schema } from "effect";

import {
  evalErrorSchema,
  evalResultRowSchema,
  readEvalJsonLines,
} from "./eval-run-records";
import type { EvalResultRow } from "./eval-run-records";

// The evals' report: one HTML page (.eval/agent/report/index.html) with
// every run (variant) side by side and, for each, every case: its checks
// and judges with their reasons, the user's messages, the agent's answer
// and the tools it called. run-agent-evals.ts writes it after each run, and
// `npm run eval:report` rewrites it from what .eval/agent holds. It stands
// in for the eval-skills toolkit's report.mjs, which the template expects
// beside its runs but does not ship. The page is static and self-contained:
// open it in a browser.

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const defaultEvalRoot = path.join(projectRoot, ".eval/agent");

// The fields of a review record (traces/traces.jsonl) the report shows.
const evalTraceSchema = Schema.Struct({
  trace_id: Schema.String,
  input: Schema.String,
  output: Schema.NullOr(Schema.String),
  duration_ms: Schema.Finite,
  steps: Schema.Array(
    Schema.Struct({
      type: Schema.String,
      name: Schema.String,
      input: Schema.optional(Schema.Unknown),
      output: Schema.optional(Schema.Unknown),
    })
  ),
  error: Schema.NullOr(Schema.String),
});

type EvalTrace = typeof evalTraceSchema.Type;

// The parts of summary.json the report shows.
const caseLevelSchema = Schema.Struct({
  pass_rate: Schema.NullOr(Schema.Finite),
  ci95: Schema.Array(Schema.NullOr(Schema.Finite)),
  n_cases: Schema.Finite,
});

const evalSummarySchema = Schema.Struct({
  cases: Schema.Finite,
  reps: Schema.Finite,
  rows: Schema.Finite,
  pass_rate_all: Schema.NullOr(Schema.Finite),
  ci95_all: Schema.Array(Schema.NullOr(Schema.Finite)),
  per_failure_mode: Schema.Record(Schema.String, caseLevelSchema),
  latency_s: Schema.Struct({
    p50: Schema.NullOr(Schema.Finite),
    p95: Schema.NullOr(Schema.Finite),
  }),
  errors: Schema.Struct({ app: Schema.Finite, grader: Schema.Finite }),
  missing_slots: Schema.Finite,
});

type EvalSummary = typeof evalSummarySchema.Type;

const decodeSummary = Schema.decodeUnknownSync(
  Schema.fromJsonString(evalSummarySchema)
);

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const percent = (rate: number | null | undefined) =>
  rate === null || rate === undefined ? "—" : `${Math.round(rate * 100)}%`;

const interval = (ci: readonly (number | null)[]) =>
  `${percent(ci[0])}–${percent(ci[1])}`;

// A step's input or output as the recorder kept it: JSON already.
const json = (value: EvalTrace["steps"][number]["input"]) =>
  JSON.stringify(value ?? null, null, 2);

const rateClass = (rate: number | null) => {
  if (rate === null) {
    return "none";
  }

  if (rate >= 0.9) {
    return "good";
  }

  return rate >= 0.6 ? "fair" : "poor";
};

interface EvalRunView {
  readonly variant: string;
  readonly summary: EvalSummary | null;
  readonly rows: readonly EvalResultRow[];
  readonly errors: readonly (typeof evalErrorSchema.Type)[];
}

const readRun = (runsDir: string, variant: string): EvalRunView => {
  const runDir = path.join(runsDir, variant);
  const summaryPath = path.join(runDir, "summary.json");

  return {
    variant,
    summary: existsSync(summaryPath)
      ? decodeSummary(readFileSync(summaryPath, "utf-8"))
      : null,
    rows: readEvalJsonLines(
      path.join(runDir, "results.jsonl"),
      evalResultRowSchema
    ),
    errors: readEvalJsonLines(
      path.join(runDir, "errors.jsonl"),
      evalErrorSchema
    ),
  };
};

const stepHtml = (step: EvalTrace["steps"][number]) =>
  step.type === "tool"
    ? `<details class="step"><summary>🔧 ${escapeHtml(step.name)}</summary><div class="io"><h5>input</h5><pre>${escapeHtml(json(step.input))}</pre><h5>output</h5><pre>${escapeHtml(json(step.output))}</pre></div></details>`
    : "";

const gradesHtml = (row: EvalResultRow) =>
  Object.entries(row.grades)
    .map(
      ([name, grade]) =>
        `<li class="${grade.passed ? "pass" : "fail"}"><b>${grade.passed ? "✓" : "✗"} ${escapeHtml(name)}</b> <span class="score">${grade.score.toFixed(2)}</span><div class="reason">${escapeHtml(grade.reason)}</div></li>`
    )
    .join("");

const caseHtml = (row: EvalResultRow, trace: EvalTrace | undefined) => {
  const steps = trace?.steps.map(stepHtml).join("") ?? "";
  const seconds = row.latency_s.toFixed(1);

  return `<details class="case ${row.passed_all ? "pass" : "fail"}">
<summary><span class="badge">${row.passed_all ? "PASS" : "FAIL"}</span> ${escapeHtml(row.case_id)} <span class="muted">rep ${row.rep} · ${seconds}s</span></summary>
<div class="case-body">
<h4>Checks</h4><ul class="grades">${gradesHtml(row) || '<li class="muted">Checked in code only</li>'}</ul>
<h4>User</h4><div class="text" dir="auto">${escapeHtml(trace?.input ?? "")}</div>
<h4>Agent</h4><div class="text answer" dir="auto">${escapeHtml(trace?.output ?? "—")}</div>
${steps === "" ? "" : `<h4>Tools</h4>${steps}`}
</div></details>`;
};

const criteriaHtml = (summary: EvalSummary) =>
  Object.entries(summary.per_failure_mode)
    .map(
      ([name, stats]) =>
        `<tr><td>${escapeHtml(name)}</td><td class="${rateClass(stats.pass_rate)}">${percent(stats.pass_rate)}</td><td class="muted">${interval(stats.ci95)}</td><td>${stats.n_cases}</td></tr>`
    )
    .join("");

const errorsHtml = (run: EvalRunView) =>
  run.errors.length === 0
    ? ""
    : `<h3>Ended without a verdict (${run.errors.length})</h3><ul class="errors">${run.errors
        .map(
          (error) =>
            `<li><b>${escapeHtml(error.case_id)}</b> (rep ${error.rep}, ${escapeHtml(error.stage)}): <code>${escapeHtml(error.error.slice(0, 600))}</code></li>`
        )
        .join("")}</ul>`;

const runHtml = (run: EvalRunView, traces: ReadonlyMap<string, EvalTrace>) => {
  const { summary } = run;
  const failing = run.rows.filter((row) => !row.passed_all);
  const passing = run.rows.filter((row) => row.passed_all);
  const ordered = [...failing, ...passing];

  return `<section id="run-${escapeHtml(run.variant)}">
<h2>${escapeHtml(run.variant)}</h2>
${
  summary === null
    ? '<p class="muted">No summary yet (the run did not finish).</p>'
    : `<p class="headline"><span class="rate ${rateClass(summary.pass_rate_all)}">${percent(summary.pass_rate_all)}</span> of cases pass every check <span class="muted">(95% CI ${interval(summary.ci95_all)}; ${summary.cases} cases × ${summary.reps} reps = ${summary.rows} runs; ${summary.missing_slots} missing; p50 ${summary.latency_s.p50 ?? "—"}s, p95 ${summary.latency_s.p95 ?? "—"}s)</span></p>
<table><thead><tr><th>Check</th><th>Pass</th><th>95% CI</th><th>Cases</th></tr></thead><tbody>${criteriaHtml(summary)}</tbody></table>`
}
${errorsHtml(run)}
<h3>Cases (failures first)</h3>
${ordered.map((row) => caseHtml(row, traces.get(row.trace_id))).join("\n")}
</section>`;
};

const overviewHtml = (runs: readonly EvalRunView[]) =>
  `<table><thead><tr><th>Run</th><th>All checks pass</th><th>95% CI</th><th>Runs</th><th>Errors</th></tr></thead><tbody>${runs
    .map(
      (run) =>
        `<tr><td><a href="#run-${escapeHtml(run.variant)}">${escapeHtml(run.variant)}</a></td><td class="${rateClass(run.summary?.pass_rate_all ?? null)}">${percent(run.summary?.pass_rate_all)}</td><td class="muted">${run.summary ? interval(run.summary.ci95_all) : "—"}</td><td>${run.rows.length}</td><td>${run.errors.length}</td></tr>`
    )
    .join("")}</tbody></table>`;

const pageStyle = `
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4;--good:#15803d;--fair:#b45309;--poor:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--card:#292524;--line:#44403c;--good:#4ade80;--fair:#fbbf24;--poor:#f87171}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:1000px;margin:0 auto}h1{margin:0 0 4px}h2{margin-top:40px;border-bottom:1px solid var(--line);padding-bottom:6px}
table{border-collapse:collapse;width:100%;margin:12px 0;background:var(--card)}th,td{border:1px solid var(--line);padding:6px 10px;text-align:start}
.muted{color:var(--muted);font-size:.9em}.good{color:var(--good);font-weight:600}.fair{color:var(--fair);font-weight:600}.poor{color:var(--poor);font-weight:600}
.headline .rate{font-size:1.6em}details.case{background:var(--card);border:1px solid var(--line);border-radius:8px;margin:8px 0}
details.case>summary{cursor:pointer;padding:10px 12px}.case-body{padding:0 14px 12px}
.badge{display:inline-block;font-size:.75em;font-weight:700;padding:1px 8px;border-radius:99px;margin-inline-end:6px}
.pass .badge{background:var(--good);color:var(--bg)}.fail .badge{background:var(--poor);color:var(--bg)}
ul.grades{list-style:none;padding:0}ul.grades li{margin:6px 0}li.pass b{color:var(--good)}li.fail b{color:var(--poor)}
.reason{color:var(--muted);font-size:.9em;margin-inline-start:18px}.score{color:var(--muted);font-size:.85em}
.text{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px 10px}
details.step{margin:4px 0}pre{white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:320px;overflow:auto;background:var(--bg);border:1px solid var(--line);padding:8px;border-radius:6px}
h4{margin:14px 0 6px}h5{margin:6px 0 2px;color:var(--muted)}`;

/**
 * Writes the evals' report from every run in .eval/agent/runs and the review
 * records in .eval/agent/traces.
 *
 * @param evalRoot - The evals' folder (.eval/agent).
 * @returns The report's path.
 */
export const writeEvalReport = (evalRoot = defaultEvalRoot) => {
  const runsDir = path.join(evalRoot, "runs");

  const variants = existsSync(runsDir)
    ? readdirSync(runsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted()
    : [];

  const runs = variants.map((variant) => readRun(runsDir, variant));

  const traces = new Map(
    readEvalJsonLines(
      path.join(evalRoot, "traces/traces.jsonl"),
      evalTraceSchema
    ).map((trace) => [trace.trace_id, trace])
  );

  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent eval report</title><style>${pageStyle}</style></head>
<body><main>
<h1>Agent eval report</h1>
<p class="muted">Written ${escapeHtml(new Date().toISOString())} from ${escapeHtml(evalRoot)}</p>
${runs.length === 0 ? "<p>No eval runs yet: run <code>npm run eval -- --variant &lt;name&gt; --reps 3</code>.</p>" : overviewHtml(runs)}
${runs.map((run) => runHtml(run, traces)).join("\n")}
</main></body></html>`;

  const reportDir = path.join(evalRoot, "report");
  const reportPath = path.join(reportDir, "index.html");

  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, page);

  return reportPath;
};

if (process.argv[1] === import.meta.filename) {
  console.log(`Eval report: ${writeEvalReport()}`);
}
