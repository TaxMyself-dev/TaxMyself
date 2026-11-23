import path from "node:path";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Two projects: the app's unit tests (every Effect test on @effect/vitest,
// npm test) and the agent evals (npm run eval, through DeepEval). Evals
// call the real models with the keys in .env.local, so they run on demand,
// never with the unit tests.

const evalEnvironment = loadEnv("", process.cwd(), "");

// A Langfuse on this machine, where traces cost nothing.
const localLangfuseUrl = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/u;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "#": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "evals",
          include: ["tests/evals/**/*.eval.ts"],
          environment: "node",
          // The real model keys from .env.local, but no telemetry export, so eval
          // traffic stays out of Grafana (app-observability.ts); a run started
          // with OTEL_SDK_DISABLED=false exports, to check the pipeline.
          // Langfuse traces only to a self-hosted Langfuse on this machine
          // (see Langfuse's self-hosting docs): a full run
          // is tens of thousands of Langfuse units, past Langfuse Cloud's
          // monthly allowance (2026-10-16). LANGFUSE_SAMPLE_RATE overrides it.
          env: {
            ...evalEnvironment,
            OTEL_SDK_DISABLED: process.env.OTEL_SDK_DISABLED ?? "true",
            LANGFUSE_SAMPLE_RATE:
              process.env.LANGFUSE_SAMPLE_RATE ??
              (localLangfuseUrl.test(evalEnvironment.LANGFUSE_BASE_URL ?? "")
                ? "1"
                : "0"),
          },
          // After DeepEval's matcher: the recorder wraps toPass to keep each
          // judge's verdict (tests/evals/runner/eval-run-recorder.ts).
          setupFiles: [
            "deepeval/vitest",
            "tests/evals/runner/eval-run-recorder.ts",
          ],
          globalSetup: ["deepeval/vitest/global-setup"],
          testTimeout: 180_000,
          hookTimeout: 180_000,
          // OpenAI caps gpt-6-luna at 200,000 tokens a minute for the key,
          // and a case makes a few model calls of about 6,000 tokens each:
          // one case at a time stays under it (about 150,000 a minute). Raise
          // both only with a higher limit.
          fileParallelism: false,
          maxConcurrency: 1,
        },
      },
    ],
  },
});
