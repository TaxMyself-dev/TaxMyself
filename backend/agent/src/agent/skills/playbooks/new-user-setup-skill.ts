import type { AgentSkill } from "../registry/agent-skills";

// First steps with a new user: learn what they are after, save it to their
// settings, and leave them with first tasks. EXAMPLE playbook: a flow of
// numbered steps, each with when it is done.
export const newUserSetupSkill = {
  name: "new-user-setup",
  description:
    "The user says they are new or asks how to get started, or has no tasks at all and asks what to do: load it before your first question to them, since its first step reads their tasks and settings. For one task the user already describes, set it up as <tasks> says instead; for task ideas or suggestions, use suggestTrackingTasks as <tasks> says.",
  content: `# New user setup

Goal: in a few short messages, the user's settings say what they are after, and they leave with 1 to 3 tasks.
Done when: updateUserSettings saved their answers, first tasks are created, and you said what happens next.

1. Look first. Call listTrackingTasks and read <user_settings>.
   Done when: you know which of offer and seeking are set, and how many tasks they have.
2. Ask only what is missing, at most two questions per message, in this order:
   - what they offer or sell, or what they are looking for;
   - who the ideal customer is.
   Skip every question the settings or tasks already answer. Accept short answers; one follow-up at most per topic.
   Done when: each topic is answered or the user skipped it.
3. Save the answers with updateUserSettings (and kind, name, website when they mention them). Each change replaces that field's whole value, so include what should stay. Stable facts about the user go to settings; memories are for preferences the settings have no field for.
   Done when: updateUserSettings returned. Say it is saved only then.
4. Offer 2 or 3 first tasks, each a different angle on what they want (askUserQuestion), and create the ones they pick with createTrackingTask.
   Done when: the tasks the user picked exist.
5. Close with what happens next, in one or two sentences.

Answer: conversational and short at every step.
Never: ask for anything the system does not use.`,
} as const satisfies AgentSkill;
