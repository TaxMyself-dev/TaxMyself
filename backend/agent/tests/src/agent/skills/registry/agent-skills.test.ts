import { assert, it, describe } from "@effect/vitest";
import { Schema } from "effect";

import { isAgentToolOffered } from "../../../../../src/agent/core/agent/agent-capabilities";
import {
  agentSkillInstructions,
  agentSkillListMessages,
  agentSkillNames,
  agentSkills,
  withAgentSkillList,
} from "../../../../../src/agent/skills/registry/agent-skills";
import { loadAgentSkillTool } from "../../../../../src/agent/tools/conversation/agent-skill-tool";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";

describe("agent skills", () => {
  it("every skill has its own name and a playbook", () => {
    const names = agentSkills.map((skill) => skill.name);
    assert.strictEqual(new Set(names).size, names.length);

    for (const skill of agentSkills) {
      assert.ok(skill.description && skill.content.length > 200);
    }
  });

  it("the instructions list each skill by name and use, without the playbooks", () => {
    const instructions = agentSkillInstructions();

    for (const skill of agentSkills) {
      assert.ok(instructions.includes(`- ${skill.name}: ${skill.description}`));
      assert.ok(!instructions.includes(skill.content));
    }
  });

  // A budgeted list, as Claude Code, Codex, Grok Build and DeepSeek keep
  // theirs: each description says when to use the playbook in at most 500
  // characters (DeepSeek's limit), and the whole section stays small enough
  // to send with every request.
  it("the skill list stays within its budget", () => {
    for (const skill of agentSkills) {
      assert.isAtMost(skill.description.length, 500, skill.name);
    }

    assert.isAtMost(agentSkillInstructions().length, 3000);
  });
});

// KeepInTax (Phase 3.1, plan §2.10, A19): the template's new-user-setup and
// research-brief playbooks are no longer offered.
describe("agent skills after Phase 3.1", () => {
  const conversation: AgentChatMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "היי" }] },
  ];

  it("offers no playbook: no skill list, and loadAgentSkill is not offered", () => {
    assert.deepStrictEqual(agentSkills, []);
    assert.deepStrictEqual(agentSkillListMessages(), []);
    assert.deepStrictEqual(withAgentSkillList(conversation), conversation);
    assert.isFalse(isAgentToolOffered("loadAgentSkill"));
  });

  it("a stored call that loaded a retired playbook still validates and loads nothing", async () => {
    assert.includeMembers(agentSkillNames, [
      "new-user-setup",
      "research-brief",
    ]);

    const output = await loadAgentSkillTool.execute?.(
      { name: "new-user-setup" },
      { toolCallId: "call_1", messages: [], context: {} }
    );

    assert.strictEqual(
      Schema.decodeUnknownSync(Schema.Struct({ content: Schema.String }))(
        output
      ).content,
      "This playbook is no longer available. Do what the user asked with the tools you have."
    );
  });
});
