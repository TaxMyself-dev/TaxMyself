import type { HarnessWork } from "./harness-prompt-rules";
import {
  answerFreeBlock,
  evidenceBoundaryBlock,
  harnessGeneralizeBlock,
  harnessSurfaceBlock,
  keepBaseBlock,
  tidyHarnessPrompt,
} from "./harness-prompt-rules";

// The authoring jobs of agent harnessing, ported from Harness² core/prompts.py
// (the adapt pack): propose (one INV or DOM candidate), aggregate (agg-k:
// one final from the base evidence and all 2k candidates) and composeRound
// (seq-k: checkpoint t from this round and every earlier one). The INV and
// DOM blocks keep their wording; the levers their surface lacks here
// (scripts, skills, hooks) are mapped to this agent's tool descriptions.

/**
 * The two candidate dimensions: how the agent works, and what a
 * practitioner knows.
 */
export type HarnessDimension = "INV" | "DOM";

const workBlock = (work: HarnessWork) => `# THE WORK\n\n${work.work.trim()}`;

const yardstickBlock = (work: HarnessWork) =>
  work.yardstick.trim() === ""
    ? ""
    : `# WHAT GOOD PROCESS LOOKS LIKE HERE\n\n${work.yardstick.trim()}`;

const invBlock = (
  work: HarnessWork
) => `# YOUR DIMENSION: INV -- how the agent WORKS

You own procedure, tool use and completion -- not subject matter. Trace the workflow, fix its
earliest observed divergence, and match each failure to the cheapest effective component:

- TOOL ERROR: distinguish bad input from timeout, missing capability, permission, or unread output.
  Give one bounded fallback and stop condition; never prescribe blind repetition.
- MECHANICAL REPETITION: when runs hand-roll the same call sequence or misread the same kind of
  result, write the procedure into the description of the tool involved, with its inputs, what
  to read in its output, and what to do when it fails.
- TRIGGERED WORKFLOW: a narrow multi-step procedure that starts with one tool belongs in that
  tool's description -- a deferred tool's costs nothing until loaded.
- IGNORED INVARIANT: only repeated evidence that clear prose is skipped can justify moving the
  rule into the description of the tool the agent calls at that moment, where it is read on the
  call. It must not block valid completion.
- ORDINARY SEQUENCING: prefer concise always-on guidance. Do not add text for a one-off mistake
  or automate professional judgment.

Define "enough evidence," reserve room for every part of the ${work.deliverableWord}, and check the
${work.deliverableWord} against what the tools returned; a tool call that succeeded does not
establish that its result answers the request.

${work.invLevers.trim()}

Do not add professional rules, required domain sections or matter facts. A parallel candidate
owns them; stay focused on how the agent works.`;

const domBlock = (
  work: HarnessWork
) => `# YOUR DIMENSION: DOM -- what a PRACTITIONER knows

You own the practitioner model the agent lacks: the ${work.deliverableWord}, audience and decision,
controlling sources, required structure, consistency relationships, and expert omissions.

Turn it into checkable rules:

- ANALYTIC MOVE: name the operation -- compare, reconcile, calculate, classify, trace, draft or
  explain -- its inputs and required result.
- ARTIFACT CONTRACT: name required parts, their dependencies, and domain checks for consistency
  and practical use.
- DECISION RULE: state the trigger, supporting evidence, conflicts to resolve, and uncertainty
  that must remain explicit.
- ENCODING: choose the FORM as deliberately as the content. The description of the tool the
  knowledge applies to is the default home for domain knowledge with a recognisable trigger --
  which sources serve a kind of request, what a result of that kind must contain, the checks
  that apply to it. It is read when that situation arises, and the next task in this
  ${work.domainWord} can copy it.
  Always-on instructions are for the short, universal facts that apply to EVERY conversation
  here, and they are paid for on every request -- so if you add some, cut some. Never store
  this conversation's facts as durable instruction: they are wrong anchors for the next one.

${work.domLevers.trim()}

Two hard rules:
- Never invent an authority, identifier, standard or citation. Point to an authorized source;
  asserting it requires evidence.
- State knowledge the agent can APPLY and CHECK, not background reading. "Before finishing,
  confirm X covers each of A, B, C" beats a paragraph of exposition.

Matter facts are in the supplied material. Say where to retrieve and reconcile them; never put
presumed facts into the harness.

Do not diagnose commands, retries, reading order, output paths, budgeting or tool-loop mechanics.
A parallel candidate owns procedure; stay on practitioner knowledge.`;

const howToDecideBlock = (where: string) =>
  [
    "# HOW TO DECIDE WHAT TO CHANGE\n",
    "Every edit must trace to a moment in a trajectory. For each one ask: which run did what, and would this text have changed it? If you cannot name the moment, the edit is speculation and costs context for nothing. Prefer, in order:",
    "  1. a DIVERGENCE -- the runs disagreed, so the agent can already do it and just needs telling. This is the cheapest win.",
    "  2. a repeated concrete failure -- the same error or omission in every run.",
    "  3. a risk visible in a trajectory but not yet realised.",
    "Do not fix what the runs already got right, and do not restate what the harness already says clearly; duplicated instruction dilutes the rest.",
    ...(where.trim() === "" ? [] : ["", where.trim()]),
    "",
    "Do not hedge toward an average or try to cover every base -- commit to the single most defensible version of your dimension. A later stage compares and merges.",
  ].join("\n");

/**
 * The job for one INV or DOM candidate.
 *
 * @param work - The work's text.
 * @param dimension - INV or DOM.
 * @param deferredTools - The tools that load through tool search.
 * @param options - k, the candidate's index, and the round in sequential
 *   mode.
 * @returns The prompt.
 */
export const harnessProposePrompt = (
  work: HarnessWork,
  dimension: HarnessDimension,
  deferredTools: readonly string[],
  options: { k: number; index: number; round?: number }
) => {
  const { k, index, round } = options;

  let where =
    k > 1
      ? `You are candidate ${index} of ${k} on this dimension, drawn independently from the same evidence.`
      : "";

  if (round !== undefined) {
    where += `\n\nThis is round ${round}. You are editing the checkpoint the previous round produced, not the original harness, and the evidence includes every earlier round. In this stage \`KEEP_BASE\` means leave that CURRENT checkpoint unchanged; it never resets to the original harness.`;
  }

  return tidyHarnessPrompt(
    [
      "You are adapting an autonomous agent's harness.",
      workBlock(work),
      dimension === "INV" ? invBlock(work) : domBlock(work),
      harnessGeneralizeBlock(work.domainWord),
      howToDecideBlock(where),
      yardstickBlock(work),
      answerFreeBlock,
      evidenceBoundaryBlock,
      harnessSurfaceBlock(deferredTools),
    ].join("\n\n")
  );
};

/**
 * agg-k: compose ONE final from the base evidence and all 2k candidates.
 *
 * @param work - The work's text.
 * @param deferredTools - The tools that load through tool search.
 * @param k - The number of base rollouts and candidates per dimension.
 * @returns The prompt.
 */
export const harnessAggregatePrompt = (
  work: HarnessWork,
  deferredTools: readonly string[],
  k: number
) =>
  tidyHarnessPrompt(
    [
      "You are composing THE final harness for one piece of work. What you emit is what gets ADOPTED: it runs on this task, and if selected it enters this area's library where later tasks read it. Every rule that bound the candidate proposers binds you -- you are the last gate, and merging an edit launders it.",
      workBlock(work),
      `# WHAT YOU HAVE\n\n${k} rollout${k > 1 ? "s" : ""} under the unmodified harness, and ${2 * k} candidate harnesses -- ${k} on the INV dimension (how the agent works) and ${k} on the DOM dimension (what a practitioner knows). Each candidate was rolled out ONCE and you have that rollout.\n\nThe candidates were sampled separately but share the same task, evidence and likely model biases. Agreement is support, not independent proof; contradiction is a reason to inspect the trajectories, not to vote.`,
      `# HOW TO WEIGH THE EVIDENCE\n\nThe ${k} base rollout${k > 1 ? "s are" : " is"} draws from ONE distribution -- read them as a set, not as ${k} separate stories.\n\n- A failure that repeats across the base set is a real property of the base harness and the strongest thing you can act on. A defect in 1/${k} is noise, and an edit aimed at it is overfitting to one sample.\n- Each candidate has ONE rollout, so a single good or bad outcome is weak evidence either way. An edit earns its place when a SPECIFIC MOMENT in a trajectory shows the mechanism -- 'this looks like good practice' is not evidence; name the moment.\n- Judge the downside as heavily as the upside. The costliest failure on this work is a run that produces nothing; an edit that helps one rollout and risks emptiness elsewhere is a bad edit.\n- IF ANY ROLLOUT ASSOCIATED WITH AN EDIT PRODUCED NOTHING, say so explicitly in your notes and treat that edit as UNSAFE unless the rest of the evidence is overwhelming. Never merge an edit from a non-delivering rollout without stating why.`,
      `# YOUR JOB\n\nCompose ONE harness. All of these are valid, judged only on what the rollouts support:\n- MERGE across candidates -- the expected outcome when an INV edit and a DOM edit each earn their place. Resolve the overlaps rather than concatenating.\n- ADOPT ONE WHOLESALE if a single candidate is simply the best state.\n- KEEP_BASE.\n\n${keepBaseBlock}`,
      k > 1
        ? `You are one of ${k} aggregators composing a final from this same evidence in parallel, and you will not see the others. Do not aim for the consensus answer -- commit to the harness you can defend.`
        : "",
      yardstickBlock(work),
      answerFreeBlock,
      evidenceBoundaryBlock,
      harnessSurfaceBlock(deferredTools),
      `# NOTES FORMAT\n\nIn your single \`<notes>\` block, one line per decision, in this exact shape:\n\n    kept|revised|dropped -> <which edit> -> <the trajectory moment or base-set pattern that decided it, with counts where sets are involved, e.g. 'failed in ${Math.max(k - 1, 2)}/${k} base rollouts'>\n\nA decision without evidence attached is a decision the next reader cannot audit.`,
    ].join("\n\n")
  );

/**
 * seq-k: compose checkpoint t from this round's candidates and every
 * earlier round.
 *
 * @param work - The work's text.
 * @param deferredTools - The tools that load through tool search.
 * @param t - The round.
 * @param k - The number of rounds.
 * @returns The prompt.
 */
export const harnessComposeRoundPrompt = (
  work: HarnessWork,
  deferredTools: readonly string[],
  t: number,
  k: number
) =>
  tidyHarnessPrompt(
    [
      `You are composing checkpoint ${t} of ${k} in a sequential adaptation loop.`,
      workBlock(work),
      `# WHAT YOU HAVE\n\nThe rollouts under the unmodified harness (the shared evidence, which does not change between rounds), this round's INV and DOM candidates with their rollouts, and every earlier round's candidates, checkpoints and trajectories. The previous checkpoint's own rollout is this round's on-policy evidence: it shows what the harness you are editing actually does.${t === 1 ? "\n\nThis is the FIRST round, so the only evidence is the base rollouts and this round's two candidates." : ""}`,
      `# YOUR JOB\n\n${t >= k ? "Compose THE FINAL harness, from the WHOLE history rather than just this round." : "Compose checkpoint ".concat(String(t), ", which the next round will build on.")}\nAll of these are valid:\n- MERGE across rounds -- including a candidate REJECTED earlier, if a later rollout now argues for it.\n- REPRODUCE an earlier checkpoint verbatim, if that state was simply the best one and later rounds drifted away from it.\n- ADOPT this round's best candidate.\n- KEEP_BASE.\n\n${keepBaseBlock}\n\nHere \`KEEP_BASE\` means keep the CURRENT checkpoint in \`context/harness/\` unchanged; it does not restore the original harness. In \`<notes>\`, identify which rounds' edits survive and which were dropped or restored.`,
      answerFreeBlock,
      evidenceBoundaryBlock,
      harnessSurfaceBlock(deferredTools),
    ].join("\n\n")
  );
