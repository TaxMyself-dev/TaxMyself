const assert = require("node:assert/strict");
const test = require("node:test");
const { exactLabelPattern } = require("../registration-locators");

test("matches a visible registration label with an optional required marker", () => {
  const pattern = exactLabelPattern("סיסמה");

  assert.match("סיסמה", pattern);
  assert.match("  סיסמה * ", pattern);
  assert.doesNotMatch("אימות סיסמה", pattern);
});

test("treats punctuation in visible labels literally", () => {
  const pattern = exactLabelPattern("מספר רישום חברה (ח.פ.)");

  assert.match("מספר רישום חברה (ח.פ.)", pattern);
  assert.doesNotMatch("מספר רישום חברה ח.פ.", pattern);
});
