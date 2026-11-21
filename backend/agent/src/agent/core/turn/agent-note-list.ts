/**
 * Texts as a markdown list, one "- " line each, for the agent's system notes.
 *
 * @param texts - The list's items.
 * @returns The list.
 */
export const agentNoteList = (texts: readonly string[]) =>
  texts.map((text) => `- ${text}`).join("\n");
