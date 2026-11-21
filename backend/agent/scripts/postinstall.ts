// What `npm install` runs after installing: the template's deepeval patch
// (patch-deepeval.ts), then the messages' compile (paraglide), which the
// tests, the type-check and the build read. A production install
// (`npm ci --omit=dev`) has no paraglide; the build compiles the messages
// itself, so the compile is skipped there.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");

execFileSync(process.execPath, [path.join(root, "scripts/patch-deepeval.ts")], {
  stdio: "inherit",
});

const paraglide = path.join(
  root,
  "node_modules/@inlang/paraglide-js/bin/run.js"
);

if (existsSync(paraglide)) {
  execFileSync(
    process.execPath,
    [
      paraglide,
      "compile",
      "--project",
      "./project.inlang",
      "--outdir",
      "./src/paraglide",
      "--strategy",
      "baseLocale",
    ],
    { cwd: root, stdio: "inherit" }
  );
}
