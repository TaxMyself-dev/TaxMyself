import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, assert, describe, it } from "@effect/vitest";

import { evalGitState } from "./eval-run-git-state";

// The eval run's fingerprint (run-agent-evals.ts) in a project nested in its
// repository, as backend/agent is: an untracked file of the project is
// hashed by its content, whichever directory git resolves --stdin-paths
// from. On Git for Windows it resolved them from the repository's top level
// and the run failed ("could not open ... for reading").

const created: string[] = [];

// git as the runner finds it (eval-run-git-state.ts).
const gitExecutable = process.platform === "win32" ? "git" : "/usr/bin/git";

const git = (cwd: string, args: string[]) =>
  execFileSync(gitExecutable, args, { cwd, encoding: "utf-8" });

// A repository with the project at nested/project, one committed file.
const nestedProject = () => {
  const repository = mkdtempSync(path.join(tmpdir(), "eval-git-state-"));
  const project = path.join(repository, "nested", "project");

  created.push(repository);
  mkdirSync(path.join(project, "src"), { recursive: true });
  writeFileSync(
    path.join(project, "src", "kept.ts"),
    "export const kept = 1;\n"
  );
  git(repository, ["init", "--quiet"]);
  git(repository, ["add", "."]);
  git(repository, [
    "-c",
    "user.name=eval",
    "-c",
    "user.email=eval@example.invalid",
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "-m",
    "init",
  ]);

  return project;
};

describe(evalGitState, () => {
  afterEach(() => {
    for (const directory of created.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("hashes an untracked file of a project nested in its repository", () => {
    const project = nestedProject();
    const clean = evalGitState(project);

    writeFileSync(path.join(project, "src", "new.ts"), "export const a = 1;\n");
    const untracked = evalGitState(project);

    writeFileSync(path.join(project, "src", "new.ts"), "export const a = 2;\n");
    const changed = evalGitState(project);

    assert.strictEqual(untracked.head, clean.head);
    assert.notStrictEqual(untracked.diff, clean.diff);
    // The same name with other content is another fingerprint.
    assert.notStrictEqual(changed.diff, untracked.diff);
    // The same tree gives the same fingerprint.
    assert.strictEqual(evalGitState(project).diff, changed.diff);
  });
});
