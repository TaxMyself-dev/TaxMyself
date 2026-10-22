import { tool } from "ai";
import { Schema } from "effect";

import {
  agentSkillNames,
  agentSkills,
} from "@/agent/skills/registry/agent-skills";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";

// Loads one of the agent's playbooks into the conversation (see
// agentSkillInstructions for when it does).
export const loadAgentSkillTool = tool({
  description:
    "Load a playbook from the skill list and follow it, before starting the multi-step flow it covers. Only when the user's request is that flow: a question one tool answers, such as listing tasks, needs no playbook.",
  inputSchema: toStandardSchema(
    Schema.Struct({ name: Schema.Literals(agentSkillNames) })
  ),
  execute: ({ name }) => {
    const skill = agentSkills.find((item) => item.name === name);

    return { name, content: skill?.content ?? "" };
  },
  // The model reads the playbook itself; the chat shows its name.
  toModelOutput: ({ output }) => ({ type: "text", value: output.content }),
});
