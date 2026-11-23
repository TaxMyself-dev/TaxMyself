import type { Tool, ToolSet } from "ai";

/**
 * A copy of the tools where patch replaces some of a tool's fields (by the
 * tool's name), or keeps the tool as it is when it answers undefined. The
 * copy keeps the tools' type (TOOLS), which the agent's stop conditions and
 * chat messages read: mapping the tools through Object.entries would lose it.
 *
 * @param tools - The tools.
 * @param patch - The fields to replace in a tool, or undefined to keep it.
 * @returns The patched copy.
 */
export const patchAgentTools = <TOOLS extends ToolSet>(
  tools: TOOLS,
  patch: (name: string, tool: Tool) => Partial<Tool> | undefined
): TOOLS => {
  const patched = { ...tools };

  for (const name of Object.keys(patched)) {
    const fields = patch(name, patched[name]);

    if (fields !== undefined) {
      Object.assign(patched, { [name]: { ...patched[name], ...fields } });
    }
  }

  return patched;
};
