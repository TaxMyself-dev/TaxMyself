import type { HarnessWork } from "./harness-prompt-rules";
import {
  answerFreeBlock,
  answerFreeSelectBlock,
  evidenceBoundaryBlock,
  evidenceBoundarySelectBlock,
  tidyHarnessPrompt,
} from "./harness-prompt-rules";

// The blind selection and the experience reflection of agent harnessing,
// ported from Harness² core/prompts.py (select, experience; the adapt
// pack). Selection compares ANSWERS with the harnesses hidden; reflection
// reads the whole round afterwards and writes the library's edit rows and
// at most one transferable lesson.

const workBlock = (work: HarnessWork) => `# THE WORK\n\n${work.work.trim()}`;

const anonymousFinalsBlock = `# THE CANDIDATES ARE ANONYMOUS ON PURPOSE

The ids are arbitrary and shuffled, and tell you nothing about how an output was produced. No
candidate is privileged and there is no credit for a more elaborate one; several may look nearly
identical, and then you decide on the small differences that actually matter.`;

/**
 * Blind selection over the k finals' answers, when there are several (a
 * single final is delivered without a session).
 *
 * @param work - The work's text.
 * @param n - The number of candidates.
 * @returns The prompt.
 */
export const harnessSelectPrompt = (work: HarnessWork, n: number) =>
  tidyHarnessPrompt(
    [
      `You are choosing which of ${n} candidate answers should be delivered to the person who asked for this work.`,
      workBlock(work),
      anonymousFinalsBlock,
      `# WHAT YOU ARE LOOKING AT\n\n    context/task.md              the request, verbatim\n    context/candidates/<id>.md  what that run PRODUCED -- the ${work.deliverableWord}, and the tool results it rests on\n\nYou are choosing between ARTIFACTS. You are not told how any of them was produced, so judge each one on what it is, against the request and the tool results it shows -- never on how impressive or thorough it sounds.`,
      `# HOW TO DECIDE, IN THIS ORDER\n\n1. DELIVERY. Does the ${work.deliverableWord} answer what the user asked, with every part they named?\n\n2. CONFORMANCE. Is it ONLY what was asked for? Where the user named a place, a budget, a number of results, a kind of item or a source, those define the request. Results outside them, or sources the user excluded, are DEVIATIONS, not improvements.\n\n3. FIDELITY. Check every claim against the tool results the candidate shows. Reject invented specifics. Where the results are silent, prefer the candidate that says so over the one that fills the gap confidently.\n\n4. INTERNAL CONSISTENCY. Counts that match the items listed, figures that agree between the summary and the list.\n\n5. OPERATIONAL FITNESS. Can the user act on it -- open the links, contact the person, decide -- without redoing the work?\n\n6. FINISH. No placeholders, unresolved notes, broken links or visibly incomplete parts.\n\nLength and polish are not merits in themselves. A shorter, correct, complete answer beats a longer one with a gap or an embellishment.`,
      answerFreeSelectBlock,
      evidenceBoundarySelectBlock,
      "# OUTPUT FORMAT\n\nFirst the reasoning, then the choice as the very last thing:\n\n<why>\nAt most 6 lines. Name the criterion that decided it, and the closest runner-up with the specific thing that cost it the pick.\n</why>\n\n```choice\n<the id of the single candidate to submit>\n```",
    ].join("\n\n")
  );

/**
 * Experience reflection: what each harness edit did, then the one lesson
 * that transfers.
 *
 * @param work - The work's text.
 * @returns The prompt.
 */
export const harnessExperiencePrompt = (work: HarnessWork) =>
  tidyHarnessPrompt(
    [
      "You are reading the complete record of one improvement round: a base harness, the edits proposed against it, the executions those edited harnesses produced, and which output was finally submitted. Write two things for a library that future work in this area reads before it makes its own edits.",
      workBlock(work),
      "# THE ADOPTED CANDIDATE IS NOT THE ONLY EVIDENCE\n\nSelection compared DELIVERABLES with the harnesses hidden, so the choice says which output read best -- not which edit worked. Treat every candidate as evidence. An edit that appeared only in a rejected candidate may still be the one that changed behavior for the better, and an edit inside the adopted candidate may have contributed nothing to why it was adopted. Read the trajectories, not the verdict.",
      "# WHAT EACH EDIT DID\n\nDiff every candidate harness against `context/base_harness/`. For each component any candidate changed, write one row: the component, what the edit actually changed, the observed difference in execution it produced, and a verdict.\n\nVerdicts are `helped`, `hurt`, `no observed effect` and `confounded`. Use `confounded` -- and prefer it -- whenever a candidate changed several components at once and no execution isolates one of them, or when a single rollout is all that stands behind the difference. A confounded row is a useful record; an invented attribution poisons the library for every later task. Cite the run and the point in the trajectory where behavior diverges. If two candidates changed the same component in different ways, say which forms were tried and what each produced.",
      "# THE ONE LESSON THAT TRANSFERS\n\nNow write at most one durable entry, and only if the edit rows support it.\n\nThe `cue` describes the SHAPE OF SITUATION the lesson applies to, so it can fire on a different matter. Not this task's facts -- the pattern. The `lesson` is the operation to perform on a harness, stated so it can be applied and checked, and it must name the component it concerns.\n\nToo generic is useless ('be thorough'); too specific never fires again ('the fee rose to 250 on Jan 1'). Aim between: 'when an instrument performs several sequential acts and one of them terminates the actor's own authority, order them so the terminating act comes last'.\n\nThe `evidence` field cites the edit rows the lesson rests on. A lesson resting only on `confounded` rows is a guess: narrow it to what the record does show, or decline. Adoption alone never establishes that an edit helped or will transfer. If the record shows no concrete, reusable execution contrast, write the single line NO_ENTRY in place of the <experience> block -- the edit rows are still worth writing.",
      answerFreeBlock,
      evidenceBoundaryBlock,
      "# OUTPUT FORMAT\n\n<edits>\ncomponent: <name as it appears in the harness tree>\ncandidates: <the labels that carried this edit>\nchange: <what the edit did>\nobserved: <the execution difference, and where you saw it>\nverdict: <helped|hurt|no observed effect|confounded>\n(repeat these five lines for each changed component)\n</edits>\n\n<experience>\ncue: <the shape of situation this applies to>\nlesson: <the transferable operation, naming the component>\nevidence: <the edit rows this rests on, and the execution contrast>\nconfidence: <high|medium|low, and why>\n</experience>",
    ].join("\n\n")
  );
