/**
 * The text without any of the given characters at its end. A loop, not a
 * /[…]+$/ regex, which backtracks over long runs (super-linear).
 *
 * @param text - The text.
 * @param characters - The characters to drop from its end.
 * @returns The trimmed text.
 */
export const trimEndCharacters = (text: string, characters: string) => {
  let end = text.length;

  while (end > 0 && characters.includes(text.charAt(end - 1))) {
    end -= 1;
  }

  return text.slice(0, end);
};
