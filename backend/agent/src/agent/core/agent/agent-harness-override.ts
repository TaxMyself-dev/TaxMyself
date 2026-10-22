import type { ToolSet } from "ai";

// An edited harness for one agent run, for agent harnessing only
// (tests/evals/harnessing, after Harness², arXiv 2610.14224): the always-on
// instructions and tool descriptions a candidate harness proposes, tried on
// an eval case before anyone adopts them. The chat never passes one; without
// it the agent runs exactly as written.

/**
 * A candidate harness's always-on instructions and tool descriptions, each
 * replacing the agent's own; what it leaves out stays as written.
 */
export interface AgentHarnessOverride {
  readonly instructions?: string;
  readonly toolDescriptions?: Readonly<Record<string, string>>;
}

/**
 * The agent's tools with a harness's descriptions in place of their own.
 *
 * @param tools - The tools as the agent gets them.
 * @param descriptions - The harness's descriptions, by tool name.
 * @returns The tools, each named one with its new description.
 */
export const withAgentToolDescriptions = <Tools extends ToolSet>(
  tools: Tools,
  descriptions: Readonly<Record<string, string>> | undefined
): Tools => {
  if (descriptions === undefined) {
    return tools;
  }

  const described: Tools = { ...tools };

  for (const [name, description] of Object.entries(descriptions)) {
    const tool = described[name];

    if (tool !== undefined) {
      Object.assign(described, { [name]: { ...tool, description } });
    }
  }

  return described;
};
