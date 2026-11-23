import { assert, it, describe } from "@effect/vitest";

import { agentAnswerAsksUser } from "../../../../../src/agent/core/turn/agent-follow-up-questions";

describe("agent follow up questions", () => {
  // An answer whose last paragraph asks the user something waits for their
  // reply, so it gets no follow-up questions.

  it("an answer asking in its last paragraph waits for the user", () => {
    assert.isTrue(agentAnswerAsksUser("באיזו עיר לחפש?"));
    assert.isTrue(
      agentAnswerAsksUser("מה אתם מציעים? כך אחפש לקוחות שמתאימים לכם.")
    );
    assert.isFalse(
      agentAnswerAsksUser("מה מצאתי?\n\nמצאתי 4 רואי חשבון בחיפה.")
    );
  });
});
