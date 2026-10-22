// Quote marks Hebrew abbreviations are written with: ממ״ד, ממ"ד, ממ”ד and
// ממד are one word to a reader.
const searchQuoteMarks = /["'״׳”“’‘]/gu;

const searchTextForm = (text: string) =>
  text.replaceAll(searchQuoteMarks, "").toLowerCase();

// A substring check of one text (a string, not a list to make a Set of).
const searchedTextHas = (text: string, word: string) => text.includes(word);

/**
 * Whether a text mentions every word of a search's text filter,
 * each anywhere in it, quote marks ignored ("ממ״ד חניה" matches "חניה
 * בטאבו, ממ"ד"). Before, the filter had to appear as written, so a search
 * with "ממ״ד" found nothing where texts write ממ"ד.
 *
 * @param text - The text searched.
 * @param filter - The search's words.
 * @returns Whether every word is mentioned.
 */
export const textMentionsWords = (text: string, filter: string) => {
  const searched = searchTextForm(text);

  return searchTextForm(filter)
    .split(/\s+/u)
    .every((word) => searchedTextHas(searched, word));
};
