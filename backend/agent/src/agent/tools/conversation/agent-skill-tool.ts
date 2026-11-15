import { tool } from "ai";
import { Schema } from "effect";

import {
  agentSkillNames,
  agentSkills,
} from "@/agent/skills/registry/agent-skills";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";

// Loads one of the agent's playbooks into the conversation (see
// agentSkillInstructions for when it does). KeepInTax (Phase 3.1): no
// playbook is offered, so this tool is not offered either
// (agentToolsNotOffered); it stays registered for stored calls, and a name
// that is no longer offered loads nothing.
export const loadAgentSkillTool = tool({
  description:
    "Load a playbook from the skill list and follow it, before starting the multi-step flow it covers. Only when the user's request is that flow: a question one tool answers needs no playbook.",
  inputSchema: toStandardSchema(
    Schema.Struct({ name: Schema.Literals(agentSkillNames) })
  ),
  execute: ({ name }) => {
    const skill = agentSkills.find((item) => item.name === name);

    return {
      name,
      content:
        skill?.content ??
        "This playbook is no longer available. Do what the user asked with the tools you have.",
    };
  },
  // The model reads the playbook itself; the chat shows its name.
  toModelOutput: ({ output }) => ({ type: "text", value: output.content }),
});
