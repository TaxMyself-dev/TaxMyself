import { assert, it, describe } from "@effect/vitest";

import {
  agentSkillInstructions,
  agentSkills,
} from "../../../../../src/agent/skills/registry/agent-skills";
import { loadAgentSkillTool } from "../../../../../src/agent/tools/conversation/agent-skill-tool";

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

  it("loading a skill gives the model its playbook and the chat its name", async () => {
    const [skill] = agentSkills;

    const output = await loadAgentSkillTool.execute?.(
      { name: skill.name },
      { toolCallId: "call_1", messages: [], context: {} }
    );

    assert.deepStrictEqual(output, {
      name: skill.name,
      content: skill.content,
    });
  });
});
