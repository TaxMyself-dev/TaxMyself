import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "**/.agents",
    "**/.claude",
    "dist",
    "src/paraglide",
    // Written by the prompt snapshot test (toMatchFileSnapshot), compared
    // byte for byte; formatting them would fail it.
    "tests/**/__snapshots__/**",
    // Vendored from the eval-skills toolkit (setup_workspace.py); update it by
    // reinstalling, not editing.
    ".eval/*/scripts",
    ".eval/*/review-app",
  ],
});
