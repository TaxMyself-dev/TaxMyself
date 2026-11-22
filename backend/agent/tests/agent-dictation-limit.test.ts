import { describe, expect, it } from "vitest";

import { AgentDictationLimit } from "../src/lib/agent-chat/dictation/agent-chat-dictation-limit";

describe("dictation temporary key limit", () => {
  it("bounds repeated issuance and permits a new window", () => {
    const limit = new AgentDictationLimit();

    for (let i = 0; i < 10; i += 1) {
      expect(limit.take("owner", 0)).toBeTruthy();
    }

    expect(limit.take("owner", 59_999)).toBeFalsy();
    expect(limit.take("other", 59_999)).toBeTruthy();
    expect(limit.take("owner", 60_000)).toBeTruthy();
  });

  it("bounds retained users without evicting active limits", () => {
    const limit = new AgentDictationLimit();

    for (let i = 0; i < 10_000; i += 1) {
      expect(limit.take(String(i), 0)).toBeTruthy();
    }

    expect(limit.take("new", 1)).toBeFalsy();
    expect(limit.take("new", 60_000)).toBeTruthy();
  });
});
