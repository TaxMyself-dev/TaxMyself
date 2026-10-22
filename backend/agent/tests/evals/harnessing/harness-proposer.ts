import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { Schema } from "effect";

import type { HarnessLedger } from "./harness-ledger";
import { harnessLedgerRemainingUsd } from "./harness-ledger";

// The proposer channel of agent harnessing: Claude Code's CLI, as Harness²'s
// claude_cli channel calls it (core/proposer.py). Each session gets a fresh
// temporary directory holding a copy of the evidence under context/, the
// mission on stdin, and returns its reply as JSON (result, total_cost_usd).
// When the stage edits a harness, context/harness is copied out before the
// directory is removed. Unlike Harness², the session gets only file tools
// (Read, Edit, Write, Glob, Grep: no shell, no MCP servers, no user
// settings or hooks) instead of --dangerously-skip-permissions, and each
// call is capped at what the run's budget has left. Every call is audited
// under auditDir/<label>/, and a finished call is reused from there when the
// loop is run again.

const sessionTimeoutMs = 60 * 60 * 1000;
const transportAttempts = 2;

const claudeReplySchema = Schema.Struct({
  result: Schema.optional(Schema.String),
  subtype: Schema.optional(Schema.String),
  is_error: Schema.optional(Schema.Boolean),
  total_cost_usd: Schema.optional(Schema.Finite),
});

/**
 * One proposer session's reply; failure is set when every transport
 * attempt failed.
 */
export interface HarnessProposerReply {
  readonly text: string;
  readonly costUsd: number;
  readonly attempts: number;
  // The harvested context/harness, when the stage asked for it.
  readonly workspace: string | null;
  readonly failure: string;
}

const runClaudeSession = async (
  cwd: string,
  mission: string,
  maxBudgetUsd: number
) => {
  const child = spawn(
    // Where Claude Code's installer puts the CLI, not one found on PATH.
    path.join(
      homedir(),
      process.platform === "win32"
        ? ".local/bin/claude.exe"
        : ".local/bin/claude"
    ),
    [
      "-p",
      "--output-format",
      "json",
      "--effort",
      "high",
      "--permission-mode",
      "acceptEdits",
      "--tools",
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "--setting-sources",
      "project",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--max-budget-usd",
      maxBudgetUsd.toFixed(2),
    ],
    { cwd, stdio: ["pipe", "pipe", "pipe"] }
  );

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-2000);
  });

  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, sessionTimeoutMs);

  child.stdin.end(mission);
  await once(child, "close");
  clearTimeout(timer);

  return { stdout, stderr };
};

// The CLI's one JSON object, tolerating text around it.
const parseClaudeReply = (stdout: string) => {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");

  try {
    return Schema.decodeSync(Schema.fromJsonString(claudeReplySchema))(
      stdout.slice(start, end + 1)
    );
  } catch {
    return null;
  }
};

const auditedReply = (
  auditDir: string,
  harvest: boolean
): HarnessProposerReply | null => {
  const replyFile = path.join(auditDir, "reply.json");
  const workspace = path.join(auditDir, "harness");

  if (!existsSync(replyFile) || (harvest && !existsSync(workspace))) {
    return null;
  }

  const reply = parseClaudeReply(readFileSync(replyFile, "utf-8"));

  return reply?.result === undefined
    ? null
    : {
        text: reply.result,
        // Spent by the run that made it, not again.
        costUsd: 0,
        attempts: 0,
        workspace: harvest ? workspace : null,
        failure: "",
      };
};

/**
 * Runs one proposer session on an evidence tree, retrying a transport
 * failure once. Each call's cost is added to the ledger as it returns.
 *
 * @param input - The mission, the evidence directory, the session's label,
 *   whether to harvest context/harness, the audit directory and the
 *   ledger.
 * @returns The reply.
 */
export const callHarnessProposer = async (input: {
  mission: string;
  contextDir: string;
  label: string;
  harvest: boolean;
  auditRoot: string;
  ledger: HarnessLedger;
}): Promise<HarnessProposerReply> => {
  const auditDir = path.join(input.auditRoot, input.label);
  const reused = auditedReply(auditDir, input.harvest);

  if (reused !== null) {
    return reused;
  }

  mkdirSync(auditDir, { recursive: true });
  writeFileSync(path.join(auditDir, "mission.md"), input.mission);
  const spent = { costUsd: 0, attempts: 0 };

  // One session in a fresh directory; a transport failure is retried once.
  const session = async (): Promise<HarnessProposerReply> => {
    spent.attempts += 1;
    const cwd = mkdtempSync(path.join(tmpdir(), "agent-harness-"));

    try {
      cpSync(input.contextDir, path.join(cwd, "context"), { recursive: true });

      const { stdout, stderr } = await runClaudeSession(
        cwd,
        input.mission,
        harnessLedgerRemainingUsd(input.ledger)
      );

      const reply = parseClaudeReply(stdout);
      const cost = reply?.total_cost_usd ?? 0;

      spent.costUsd += cost;
      input.ledger.budget.spentUsd += cost;

      if (
        reply?.result === undefined ||
        reply.is_error === true ||
        (reply.subtype !== undefined && reply.subtype !== "success")
      ) {
        const failure = `CLI error: ${reply?.subtype ?? "no reply"} ${(reply?.result ?? stderr).slice(0, 300)}`;

        return spent.attempts < transportAttempts
          ? await session()
          : {
              text: "",
              ...spent,
              workspace: null,
              failure: `HARNESS_PROPOSER_FAILED: ${input.label}: ${failure}`,
            };
      }

      const harvested = path.join(cwd, "context/harness");
      const workspace = path.join(auditDir, "harness");

      if (input.harvest && existsSync(harvested)) {
        rmSync(workspace, { recursive: true, force: true });
        cpSync(harvested, workspace, { recursive: true });
      }

      writeFileSync(path.join(auditDir, "reply.json"), stdout);

      return {
        text: reply.result,
        ...spent,
        workspace: input.harvest && existsSync(workspace) ? workspace : null,
        failure: "",
      };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };

  return await session();
};
