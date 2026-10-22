/**
 * Whether a text is there: not null, undefined or "". Narrows to string.
 *
 * @param text - The text, if any.
 * @returns Whether it has at least one character.
 */
export const isNonEmptyText = (
  text: string | null | undefined
): text is string => text !== null && text !== undefined && text !== "";
