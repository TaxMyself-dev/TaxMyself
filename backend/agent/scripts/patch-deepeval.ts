// The template's patches/deepeval@0.9.23.patch, applied after npm install
// (npm has no patchedDependencies): it deletes dist/telemetry.js and its
// .d.ts. deepeval 0.9.23 ships that stale file beside its real
// dist/telemetry/ directory, and the file wins the `require("../telemetry")`
// its modules make; it requires @sentry/node, which deepeval does not
// install, so importing deepeval fails. Without the file the directory's
// index answers, as the package means it to.
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "node_modules", "deepeval");

if (existsSync(root)) {
  for (const file of ["dist/telemetry.js", "dist/telemetry.d.ts"]) {
    rmSync(path.join(root, file), { force: true });
  }
}
