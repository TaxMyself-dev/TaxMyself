// Builds the agent for the Nest backend and the task worker: esbuild bundles
// the agent's own code (resolving the @/ and #/ paths of tsconfig.json) into
// ES modules under dist/, and leaves the packages in node_modules as they
// are. The template bundled with Vite for Nitro; the Nest backend imports
// dist/agent-http.mjs (backend/src/agent-harness), and the worker runs as
// `node dist/task-worker.mjs`.
import path from "node:path";

import { build } from "esbuild";

const root = path.join(import.meta.dirname, "..");

await build({
  absWorkingDir: root,
  entryPoints: {
    "agent-http": "src/server/agent-http.server.ts",
    "task-worker": "backend/worker/task-worker.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: true,
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
