import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { assert, describe, it } from "@effect/vitest";

import { baseAgentHarnessTree } from "./agent-harness-tree";
import type { HarnessExperience } from "./harness-library";
import { addHarnessLibraryEntry, harnessLibraryDir } from "./harness-library";

// The per-area experience library: an adopted harness is stored only with a
// lesson, under an opaque name, and the index lists it with its cue.

const caseId =
  "agent/searches/x.eval.ts > x > finds rentals in the user's city";

const experience: HarnessExperience = {
  cue: "a site search returns fewer results than asked",
  lesson: "tools/sendEmail.md: say how many were found",
  evidence: "inv1 helped: base1 stopped at one listing",
  confidence: "low, one rollout",
  edits: "component: tools/sendEmail.md",
};

const adoptedTree = {
  ...baseAgentHarnessTree(),
  "tools/sendEmail.md": "Search apartments; say how many were found.",
};

const libraryDir = () =>
  harnessLibraryDir(
    mkdtempSync(path.join(tmpdir(), "harness-library-")),
    "searches"
  );

describe("harness library", () => {
  it("an adoption with a lesson is stored and indexed with its cue", () => {
    const dir = libraryDir();

    const entry = addHarnessLibraryEntry(dir, "searches", {
      caseId,
      label: "agg1",
      why: "single final",
      tree: adoptedTree,
      experience,
    });

    const index = readFileSync(path.join(dir, "INDEX.md"), "utf-8");

    assert.isNotNull(entry);
    assert.include(index, "# Library — searches");
    assert.include(index, `- cue:     ${experience.cue}`);
    assert.include(index, "changed: tools/sendEmail.md");
    assert.include(
      readFileSync(path.join(entry ?? "", "EXPERIENCE.md"), "utf-8"),
      `- **lesson**: ${experience.lesson}`
    );
  });

  it("an adoption without a lesson stores nothing", () => {
    const dir = libraryDir();

    assert.isNull(
      addHarnessLibraryEntry(dir, "searches", {
        caseId,
        label: "agg1",
        why: "",
        tree: adoptedTree,
        experience: null,
      })
    );
    assert.isFalse(existsSync(dir));
  });

  it("an entry's name never carries the case's name", () => {
    const dir = libraryDir();

    addHarnessLibraryEntry(dir, "searches", {
      caseId,
      label: "agg1",
      why: "",
      tree: adoptedTree,
      experience,
    });
    const [name = ""] = readdirSync(path.join(dir, "harnesses"));

    assert.match(name, /^task-[0-9a-f]+$/u);
    assert.notInclude(
      readFileSync(path.join(dir, "INDEX.md"), "utf-8"),
      "rentals"
    );
  });
});
