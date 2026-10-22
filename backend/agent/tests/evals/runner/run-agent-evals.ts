import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

import { evalGitState } from "./eval-run-git-state";
import {
  evalCaseSourcesSchema,
  evalListedTestsSchema,
  evalShortHash,
} from "./eval-run-records";
import { summarizeEvalRun } from "./eval-run-summary";

// Runs the evals as one recorded, resumable run (bun run eval), following
// the eval-skills toolkit (.eval/agent, .agents/skills/eval-run):
//
//   bun run eval --variant baseline --reps 3
//   bun run eval --variant baseline --reps 3 -t "approvals"        # some cases
//   bun run eval --variant prompt-v2 --reps 3 --compare baseline
//
// 1. Indexes the cases (vitest list) into .eval/agent/dataset/goldens.jsonl,
//    with their source from case-sources.json.
// 2. Fingerprints the run: git HEAD and the diff outside .eval, the dataset,
//    the repetitions. A run directory made with another fingerprint is
//    refused: changed code is a new variant, never a resumed run.
// 3. Runs vitest once per repetition; eval-run-recorder.ts writes each case's
//    result, trace, attempts and errors, and skips slots already finished.
//    Vitest's own `repeats` stops at the first failure, so it cannot give
//    independent repetitions.
// 4. Writes summary.json (pass rates per criterion and per split, Wilson
//    intervals over cases with repetitions averaged within a case; errors;
//    missing slots; usage with the prompt cache's share) and the HTML report
//    (scripts/report.mjs). A change tuned on the train split's failures is
//    kept only when the held-out test split holds (evalCaseSplit).

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const evalRoot = path.join(projectRoot, ".eval/agent");
const evalsRoot = path.join(projectRoot, "tests/evals");
const datasetPath = path.join(evalRoot, "dataset/goldens.jsonl");
const tracesPath = path.join(evalRoot, "traces/traces.jsonl");

// Vitest's own entry, run with this Node: node_modules/.bin/vitest is a shell
// script on macOS and Linux and a .cmd on Windows, which spawn runs without
// a shell only on the first two.
const vitestEntry = path.join(projectRoot, "node_modules/vitest/vitest.mjs");

const runnerFlags = new Set(["--variant", "--reps", "--compare"]);

const runnerFlag = (name: string) => {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
};

const variant = runnerFlag("--variant");
const reps = Number(runnerFlag("--reps") ?? "1");
const compareTo = runnerFlag("--compare");

// Everything else goes to vitest (-t, files).
const vitestArgs = process.argv
  .slice(2)
  .filter(
    (arg, index, args) =>
      !runnerFlags.has(arg) && !runnerFlags.has(args[index - 1] ?? "")
  );

// The case index: every test of the evals project, with its source. Cases
// live in tests/evals; goldens.jsonl is generated from them.
const buildEvalGoldens = () => {
  const listed = Schema.decodeSync(
    Schema.fromJsonString(evalListedTestsSchema)
  )(
    execFileSync(
      process.execPath,
      [
        vitestEntry,
        "list",
        "--project",
        "evals",
        "--staticParse=false",
        "--json",
      ],
      {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    )
  );

  const sources = Schema.decodeSync(
    Schema.fromJsonString(evalCaseSourcesSchema)
  )(readFileSync(path.join(evalRoot, "dataset/case-sources.json"), "utf-8"));

  const goldens = listed.map((test) => {
    const id = `${path.relative(evalsRoot, test.file)} > ${test.name}`;

    const golden = {
      id,
      // Each case is its own conversation and fixtures, so its own group.
      group_id: id,
      input: { file: path.relative(projectRoot, test.file), test: test.name },
      tags: [path.relative(evalsRoot, test.file).replace(/\.eval\.ts$/u, "")],
      source: sources.cases[id] ?? sources.default,
    };

    return { ...golden, case_hash: evalShortHash(JSON.stringify(golden)) };
  });

  const unknown = Object.keys(sources.cases).filter(
    (id) => !goldens.some((golden) => golden.id === id)
  );

  if (unknown.length > 0) {
    throw new Error(
      `AGENT_EVAL_SOURCE_UNKNOWN_CASE: case-sources.json names cases that do not exist: ${unknown.join("; ")}`
    );
  }

  writeFileSync(
    datasetPath,
    goldens.map((golden) => `${JSON.stringify(golden)}\n`).join("")
  );

  return goldens;
};

const runAgentEvals = (runVariant: string) => {
  mkdirSync(path.join(evalRoot, "dataset"), { recursive: true });
  mkdirSync(path.join(evalRoot, "traces"), { recursive: true });
  const goldens = buildEvalGoldens();
  const repository = evalGitState(projectRoot);

  const config = {
    git_head: repository.head,
    git_diff: repository.diff,
    dataset_version: evalShortHash(
      goldens.map((golden) => golden.case_hash).join(",")
    ),
    reps,
  };

  // A filter (-t, files) narrows the scope of a run, not what it measures,
  // so a filtered run resumes into the same variant.
  const fingerprint = evalShortHash(JSON.stringify(config));
  const runDir = path.join(evalRoot, "runs", runVariant);
  const manifestPath = path.join(runDir, "manifest.json");

  if (
    existsSync(manifestPath) &&
    !readFileSync(manifestPath, "utf-8").includes(`"${fingerprint}"`)
  ) {
    throw new Error(
      `AGENT_EVAL_RUN_CHANGED: runs/${runVariant} was made from other code, cases or settings; use a new --variant`
    );
  }

  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schema_version: 1,
        flow: "agent",
        dataset_version: config.dataset_version,
        run_id: runVariant,
        run_fingerprint: fingerprint,
        expected_results: goldens.length * reps,
        sample_purpose: "regression",
        config: { ...config, vitest_args: vitestArgs },
        started_at: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(
    `Scope: ${goldens.length} cases × ${reps} reps → runs/${runVariant} (fingerprint ${fingerprint})`
  );

  for (let currentRep = 0; currentRep < reps; currentRep += 1) {
    // A failing case fails vitest; the recorder kept it, so carry on.
    spawnSync(
      process.execPath,
      [vitestEntry, "run", "--project", "evals", ...vitestArgs],
      {
        cwd: projectRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          DEEPEVAL_TELEMETRY_OPT_OUT: "1",
          // A run traced in Langfuse (a local one, vitest.config.ts) stays
          // apart from real chats.
          LANGFUSE_TRACING_ENVIRONMENT: "eval",
          AGENT_EVAL_RUN_DIR: runDir,
          AGENT_EVAL_REP: String(currentRep),
          AGENT_EVAL_VARIANT: runVariant,
          AGENT_EVAL_HARNESS_HASH: fingerprint,
          AGENT_EVAL_DATASET: datasetPath,
          AGENT_EVAL_TRACES: tracesPath,
        },
      }
    );
  }

  summarizeEvalRun(runDir, fingerprint, goldens.length, {
    evalRoot,
    variant: runVariant,
    reps,
    compareTo,
  });
  // The report script uses Node's standard library only; the Bun running the
  // evals (process.execPath) runs it, not a node found on PATH.
  execFileSync(
    process.execPath,
    [
      path.join(evalRoot, "scripts/report.mjs"),
      "--runs",
      path.join(evalRoot, "runs"),
    ],
    { stdio: "inherit" }
  );
};

if (variant === undefined) {
  throw new Error("AGENT_EVAL_RUN_VARIANT: pass --variant <name>");
}

runAgentEvals(variant);
