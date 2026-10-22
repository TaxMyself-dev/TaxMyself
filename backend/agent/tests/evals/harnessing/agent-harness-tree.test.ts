import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { assert, describe, it } from "@effect/vitest";

import { agentInstructions } from "@/agent/core/agent/agent-instructions";
import { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";

import {
  agentEvalHarness,
  agentHarnessOverrideOf,
  agentHarnessTreeChanges,
  baseAgentHarnessTree,
  readAgentHarnessTree,
  validateAgentHarnessTree,
  writeAgentHarnessTree,
} from "./agent-harness-tree";

// The agent's editable harness for agent harnessing: what the base tree
// holds, how a tree round-trips through disk, and what validation refuses.

const scratchDir = () =>
  mkdtempSync(path.join(tmpdir(), "agent-harness-tree-"));

const invalidReason = async (tree: Record<string, string>) => {
  try {
    await validateAgentHarnessTree(tree);

    return "";
  } catch (error) {
    return String(error);
  }
};

describe("agent harness tree", () => {
  it("the base tree is the agent's instructions and every tool's description", () => {
    const tree = baseAgentHarnessTree();

    assert.strictEqual(tree["instructions.md"], agentInstructions());
    assert.strictEqual(
      tree["tools/listTrackingTasks.md"],
      appAgentTools.listTrackingTasks.description
    );
    // Every tool but the hosted toolSearch, which has no description.
    assert.strictEqual(
      Object.keys(tree).length,
      Object.keys(appAgentTools).length
    );
    assert.notProperty(tree, "tools/toolSearch.md");
  });

  it("a tree written to disk reads back the same", () => {
    const tree = baseAgentHarnessTree();
    const dir = writeAgentHarnessTree(tree, scratchDir());

    assert.deepStrictEqual(readAgentHarnessTree(dir), tree);
  });

  it("files off the editable surface are left out and listed", () => {
    const dir = scratchDir();

    mkdirSync(path.join(dir, "tools"), { recursive: true });
    mkdirSync(path.join(dir, "skills/x"), { recursive: true });
    writeFileSync(path.join(dir, "instructions.md"), "be useful");
    writeFileSync(path.join(dir, "tools/listTrackingTasks.md"), "lists");
    writeFileSync(path.join(dir, "skills/x/SKILL.md"), "a skill");
    writeFileSync(path.join(dir, "notes.txt"), "notes");
    const rejected: string[] = [];

    assert.deepStrictEqual(readAgentHarnessTree(dir, rejected), {
      "instructions.md": "be useful",
      "tools/listTrackingTasks.md": "lists",
    });
    assert.deepStrictEqual(rejected.toSorted(), [
      "notes.txt",
      "skills/x/SKILL.md",
    ]);
  });

  it("the base tree passes validation", async () => {
    assert.strictEqual(await invalidReason(baseAgentHarnessTree()), "");
  });

  it("instructions of exactly 20,000 characters pass and 20,001 do not", async () => {
    const base = baseAgentHarnessTree();

    assert.strictEqual(
      await invalidReason({ ...base, "instructions.md": "a".repeat(20_000) }),
      ""
    );
    assert.include(
      await invalidReason({ ...base, "instructions.md": "a".repeat(20_001) }),
      "`instructions.md` is 20,001 characters"
    );
  });

  it("empty instructions are refused", async () => {
    assert.include(
      await invalidReason({
        ...baseAgentHarnessTree(),
        "instructions.md": " ",
      }),
      "`instructions.md` is missing or empty"
    );
  });

  it("a description for a tool the agent does not have is refused", async () => {
    assert.include(
      await invalidReason({
        ...baseAgentHarnessTree(),
        "tools/sendEmail.md": "sends email",
      }),
      "`tools/sendEmail.md` names no tool the agent has"
    );
  });

  it("the hosted toolSearch's description cannot be set", async () => {
    assert.include(
      await invalidReason({
        ...baseAgentHarnessTree(),
        "tools/toolSearch.md": "search tools",
      }),
      "`tools/toolSearch.md` names no tool the agent has"
    );
  });

  it("an empty tool description is refused", async () => {
    assert.include(
      await invalidReason({
        ...baseAgentHarnessTree(),
        "tools/listTrackingTasks.md": "",
      }),
      "`tools/listTrackingTasks.md` is empty"
    );
  });

  it("an up-front tool description past the shared budget is refused", async () => {
    assert.include(
      await invalidReason({
        ...baseAgentHarnessTree(),
        "tools/listTrackingTasks.md": "a".repeat(20_000),
      }),
      "The tools sent on every request"
    );
  });

  it("a long description of a deferred tool spends no up-front budget", async () => {
    assert.strictEqual(
      await invalidReason({
        ...baseAgentHarnessTree(),
        "tools/searchWeb.md": "a".repeat(20_000),
      }),
      ""
    );
  });

  it("a harness that carries a verdict marker is refused", async () => {
    assert.include(
      await invalidReason({
        ...baseAgentHarnessTree(),
        "instructions.md": 'Remember "passed_all" is the goal.',
      }),
      "HARNESS_GRADER_VERDICT_LEAK"
    );
  });

  it("every problem is listed in one error", async () => {
    const reason = await invalidReason({
      "instructions.md": "",
      "tools/sendEmail.md": "sends email",
    });

    assert.include(reason, "AGENT_HARNESS_INVALID");
    assert.include(reason, "`instructions.md` is missing or empty");
    assert.include(reason, "`tools/sendEmail.md` names no tool");
  });

  it("changes name the added, removed and modified files", () => {
    assert.deepStrictEqual(
      agentHarnessTreeChanges(
        { "instructions.md": "a", "tools/x.md": "x", "tools/y.md": "y" },
        { "instructions.md": "b", "tools/x.md": "x", "tools/z.md": "z" }
      ),
      {
        added: ["tools/z.md"],
        removed: ["tools/y.md"],
        modified: ["instructions.md"],
      }
    );
  });

  it("a tree becomes the override the agent runs", () => {
    assert.deepStrictEqual(
      agentHarnessOverrideOf({
        "instructions.md": "be useful",
        "tools/listTrackingTasks.md": "lists the tasks",
      }),
      {
        instructions: "be useful",
        toolDescriptions: { listTrackingTasks: "lists the tasks" },
      }
    );
  });

  it("the eval agent runs the tree in AGENT_HARNESS_DIR, and none when it is empty", () => {
    const dir = writeAgentHarnessTree(
      { "instructions.md": "be useful" },
      scratchDir()
    );

    const before = process.env.AGENT_HARNESS_DIR;

    try {
      process.env.AGENT_HARNESS_DIR = dir;
      assert.strictEqual(agentEvalHarness()?.instructions, "be useful");
      process.env.AGENT_HARNESS_DIR = "";
      assert.isUndefined(agentEvalHarness());
    } finally {
      process.env.AGENT_HARNESS_DIR = before ?? "";
    }
  });
});
