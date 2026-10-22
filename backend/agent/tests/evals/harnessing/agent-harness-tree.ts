import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { asSchema } from "ai";
import { Predicate } from "effect";

import type { AgentHarnessOverride } from "@/agent/core/agent/agent-harness-override";
import { agentInstructions } from "@/agent/core/agent/agent-instructions";
import {
  agentToolNamespaceName,
  deferRareAgentTools,
} from "@/agent/core/tool-runtime/agent-tool-search";
import { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";

import { assertHarnessTreeHasNoGraderVerdicts } from "./harness-evidence-guard";

// The agent's editable harness for agent harnessing (after Harness², arXiv
// 2610.14224, core/tree.py), as a tree of text files:
//
//   instructions.md     the always-on instructions (agentInstructions)
//   tools/<name>.md     one tool's description; a missing file keeps the
//                       tool's own
//
// The eval agent runs a tree from AGENT_HARNESS_DIR (agentEvalHarness);
// without it the agent runs as written. Validation errors are fed back to
// the proposer verbatim, so they say what to fix.

/**
 * A harness tree: each file's path in the tree and its text.
 */
export type AgentHarnessTree = Readonly<Record<string, string>>;

const instructionsFile = "instructions.md";
const toolsDir = "tools";

// The budgets agent-prompt-snapshots.test.ts holds the real agent to.
const instructionsBudget = 20_000;
const upFrontToolsBudget = 20_000;

// The system's git, at its fixed path, not one found on PATH.
// git at its system path, not one found on PATH; on Windows, Git for
// Windows puts git.exe on PATH (there is no /usr/bin).
const gitExecutable = process.platform === "win32" ? "git" : "/usr/bin/git";

const toolFile = (name: string) => `${toolsDir}/${name}.md`;

const harnessToolName = (file: string) =>
  file.startsWith(`${toolsDir}/`) && file.endsWith(".md")
    ? file.slice(toolsDir.length + 1, -".md".length)
    : undefined;

const isHarnessSurfaceFile = (file: string) =>
  file === instructionsFile || harnessToolName(file) !== undefined;

// The tools whose description is text; the hosted toolSearch has none.
const agentToolNames = new Set(
  Object.entries(appAgentTools).flatMap(([name, tool]) =>
    Predicate.isString(tool.description) ? [name] : []
  )
);

/**
 * The agent's harness as written: its instructions (the Hebrew locale the
 * evals run in) and every tool's description.
 *
 * @returns The base tree.
 */
export const baseAgentHarnessTree = () =>
  Object.fromEntries([
    [instructionsFile, agentInstructions()],
    ...Object.entries(appAgentTools).flatMap(([name, tool]) =>
      Predicate.isString(tool.description)
        ? [[toolFile(name), tool.description] as const]
        : []
    ),
  ]);

const listTreeFiles = (root: string, dir = ""): string[] =>
  readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listTreeFiles(root, path.posix.join(dir, entry.name))
      : [path.posix.join(dir, entry.name)]
  );

/**
 * Reads a harness tree from disk; files off the editable surface are left
 * out and listed in rejected.
 *
 * @param root - The tree's directory.
 * @param rejected - Where the files off the surface are listed.
 * @returns The tree.
 */
export const readAgentHarnessTree = (
  root: string,
  rejected: string[] = []
): AgentHarnessTree => {
  if (!existsSync(root)) {
    return {};
  }

  const files = listTreeFiles(root);

  rejected.push(...files.filter((file) => !isHarnessSurfaceFile(file)));

  return Object.fromEntries(
    files
      .filter((file) => isHarnessSurfaceFile(file))
      .map((file) => [file, readFileSync(path.join(root, file), "utf-8")])
  );
};

/**
 * Writes a harness tree to a fresh directory.
 *
 * @param tree - The tree.
 * @param root - Its directory, replaced.
 * @returns The directory.
 */
export const writeAgentHarnessTree = (tree: AgentHarnessTree, root: string) => {
  rmSync(root, { recursive: true, force: true });

  for (const [file, text] of Object.entries(tree)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }

  return root;
};

/**
 * The files one tree adds, removes or changes against another.
 *
 * @param from - The tree edited.
 * @param to - The edited tree.
 * @returns The changed files by kind.
 */
export const agentHarnessTreeChanges = (
  from: AgentHarnessTree,
  to: AgentHarnessTree
) => ({
  added: Object.keys(to).filter((file) => !(file in from)),
  removed: Object.keys(from).filter((file) => !(file in to)),
  modified: Object.keys(to).filter(
    (file) => file in from && from[file] !== to[file]
  ),
});

/**
 * A unified diff between two harness directories, by git diff --no-index.
 *
 * @param fromDir - The tree edited.
 * @param toDir - The edited tree.
 * @returns The diff; empty when they are the same.
 */
export const agentHarnessTreeDiff = (fromDir: string, toDir: string) =>
  spawnSync(
    gitExecutable,
    ["diff", "--no-index", "--no-color", "--", fromDir, toDir],
    {
      encoding: "utf-8",
    }
  ).stdout;

const upFrontToolsLength = async (tree: AgentHarnessTree) => {
  const tools = deferRareAgentTools(appAgentTools);

  const parts = await Promise.all(
    Object.entries(tools)
      .filter(([name]) => agentToolNamespaceName(name) === undefined)
      .map(async ([name, tool]) => {
        const description =
          tree[toolFile(name)] ??
          (Predicate.isString(tool.description) ? tool.description : "");

        return `${description}${JSON.stringify(await asSchema(tool.inputSchema).jsonSchema)}`;
      })
  );

  return parts.join("").length;
};

/**
 * Checks a proposed tree; throws one Error listing every problem in words
 * the proposer can act on.
 *
 * @param tree - The proposed tree.
 */
export const validateAgentHarnessTree = async (tree: AgentHarnessTree) => {
  const problems: string[] = [];
  const instructions = tree[instructionsFile] ?? "";

  if (instructions.trim() === "") {
    problems.push(
      "`instructions.md` is missing or empty: it is the agent's only always-on instruction text. Trim it, never empty it."
    );
  }

  if (instructions.length > instructionsBudget) {
    problems.push(
      `\`instructions.md\` is ${instructions.length.toLocaleString("en")} characters; the budget is ${instructionsBudget.toLocaleString("en")}. Cut something to pay for what you added.`
    );
  }

  for (const file of Object.keys(tree)) {
    const name = harnessToolName(file);

    if (name !== undefined && !agentToolNames.has(name)) {
      problems.push(
        `\`${file}\` names no tool the agent has; a tool description can only change an existing tool's (see the files in \`tools/\`).`
      );
    } else if (name !== undefined && tree[file]?.trim() === "") {
      problems.push(
        `\`${file}\` is empty; delete the file to keep the tool's own description.`
      );
    }
  }

  const upFront = await upFrontToolsLength(tree);

  if (upFront > upFrontToolsBudget) {
    problems.push(
      `The tools sent on every request (their descriptions and input schemas) come to ${upFront.toLocaleString("en")} characters; the budget is ${upFrontToolsBudget.toLocaleString("en")}. Shorten an up-front tool's description.`
    );
  }

  try {
    assertHarnessTreeHasNoGraderVerdicts(tree);
  } catch (error) {
    problems.push(String(error));
  }

  if (problems.length > 0) {
    throw new Error(`AGENT_HARNESS_INVALID:${["", ...problems].join("\n- ")}`);
  }
};

/**
 * The override a harness tree makes: its instructions and each tool
 * description it has.
 *
 * @param tree - The tree.
 * @returns The override for createAppAgent.
 */
export const agentHarnessOverrideOf = (
  tree: AgentHarnessTree
): AgentHarnessOverride => ({
  instructions: tree[instructionsFile],
  toolDescriptions: Object.fromEntries(
    Object.entries(tree).flatMap(([file, text]) => {
      const name = harnessToolName(file);

      return name === undefined ? [] : [[name, text]];
    })
  ),
});

/**
 * The harness an eval agent runs: the tree in AGENT_HARNESS_DIR, set by the
 * harnessing loop (harness-rollout.ts), or none.
 *
 * @returns The override, or undefined to run the agent as written.
 */
export const agentEvalHarness = (): AgentHarnessOverride | undefined => {
  const dir = process.env.AGENT_HARNESS_DIR;

  return dir === undefined || dir === ""
    ? undefined
    : agentHarnessOverrideOf(readAgentHarnessTree(dir));
};
