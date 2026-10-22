import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";

import { evalShortHash } from "./eval-run-records";

// The working tree an eval run fingerprints (run-agent-evals.ts).

// The system's git, at its fixed path, not one found on PATH.
// git at its system path, not one found on PATH; on Windows, Git for
// Windows puts git.exe on PATH (there is no /usr/bin).
const gitExecutable = process.platform === "win32" ? "git" : "/usr/bin/git";

const git = (projectRoot: string, args: string[]) =>
  execFileSync(gitExecutable, args, {
    cwd: projectRoot,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });

/**
 * HEAD, plus a hash of the uncommitted and untracked changes outside .eval.
 *
 * @param projectRoot - The repository's root.
 * @returns The HEAD commit and a hash of the changes.
 */
export const evalGitState = (projectRoot: string) => {
  // Untracked files by their content hash; directories (a nested
  // repository) and symlinks (installed skills) are left out.
  const untrackedFiles = git(projectRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ".",
    ":(exclude).eval",
  ])
    .split("\n")
    .filter(
      (file) => file !== "" && lstatSync(path.join(projectRoot, file)).isFile()
    );

  const untracked = `${untrackedFiles.join("\n")}\n${execFileSync(
    gitExecutable,
    ["hash-object", "--stdin-paths"],
    { cwd: projectRoot, encoding: "utf-8", input: untrackedFiles.join("\n") }
  )}`;

  return {
    head: git(projectRoot, ["rev-parse", "HEAD"]).trim(),
    diff: evalShortHash(
      git(projectRoot, [
        "diff",
        "HEAD",
        "--no-ext-diff",
        "--",
        ".",
        ":(exclude).eval",
      ]) + untracked
    ),
  };
};
