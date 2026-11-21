import type { ToolSet } from "ai";

import { isAgentToolOffered } from "../agent/agent-capabilities";
import { patchAgentTools } from "./agent-tool-patch";
import type { AppAgentToolName } from "./app-agent-tools";

// Rarely used tools load on demand: the model sees each namespace's name and
// description, and OpenAI's hosted tool search (the agent's toolSearch tool)
// loads a namespace's functions when an answer needs them, in the same
// response, without breaking the prompt cache (new definitions go at the end
// of the context). Codex's tool_search and Claude Code's ToolSearch do the
// same for their long tail (docs/research/agent-harness/overview.md, item 14).
// OpenAI recommends namespaces of fewer than 10 functions with high-level
// descriptions (developers.openai.com/api/docs/guides/tools-tool-search).
// The core KeepInTax work (your main records, memory
// and the chat's own tools) stays loaded on every request.
// EXAMPLE namespaces: put each group of your rare tools in one, with a
// high-level description of when it is needed.
// classifyTransaction stays eagerly available: its forced approval step offers
// only that tool, so it cannot depend on a deferred namespace/tool_search.
const agentToolNamespaces = [
  {
    name: "profile",
    description:
      "Focused updates and forgetting in the shared personal/business profile, preserving dated history. Read the profile first.",
    tools: ["updateUserProfile"],
  },
  {
    name: "books",
    description:
      "The user's books beyond expenses: bank and card transactions (money in and out), the invoices and receipts their business issued, their expense categories, and their customers.",
    tools: [
      "queryTransactions",
      "prepareTransactionClassification",
      "startAutomaticClassification",
      "queryIssuedDocuments",
      "listCategories",
      "listClients",
    ],
  },
  {
    name: "reports",
    description:
      "The user's tax and accounting reports from their books: profit and loss, the VAT report, income-tax advances, the VAT and advance reports coming up and their due dates, and what still needs review before a report.",
    tools: [
      "getProfitAndLoss",
      "getVatSummary",
      "getAdvanceTaxStatus",
      "listUpcomingReports",
      "getReportReadiness",
    ],
  },
  // KeepInTax (Phase 3.1, A16): sendEmail stays registered for stored
  // conversations but is not offered (agent-capabilities.ts), so the
  // instructions' line below leaves this namespace out.
  {
    name: "email",
    description:
      "Email in the user's name: write and send an email to someone the user chose.",
    tools: ["sendEmail"],
  },
  {
    name: "attached_documents",
    description:
      "Read the parts of a document the user attached that its message does not show: search its rows or passages, or page through it.",
    tools: ["readAttachedDocument"],
  },
  {
    name: "action_rules",
    description:
      "Save the user's rule for one of your actions (allow without asking, ask first, or never): changing settings, remembering.",
    tools: ["setAgentActionRule"],
  },
] as const satisfies readonly {
  name: string;
  description: string;
  tools: readonly AppAgentToolName[];
}[];

// KeepInTax (Phase 3.1): the namespaces as the model is told of them, each
// with only its offered tools, and none left empty.
const agentOfferedToolNamespaces = () =>
  agentToolNamespaces.flatMap(({ name, tools }) => {
    const offered = tools.filter((tool) => isAgentToolOffered(tool));

    return offered.length === 0 ? [] : [{ name, tools: offered }];
  });

const agentToolNamespaceByTool: ReadonlyMap<
  string,
  { name: string; description: string }
> = new Map(
  agentToolNamespaces.flatMap(({ name, description, tools }) =>
    tools.map((tool) => [tool, { name, description }] as const)
  )
);

/**
 * The namespace a deferred tool loads in, or undefined for a tool loaded on
 * every request.
 *
 * @param toolName - The tool's name.
 * @returns The namespace's name.
 */
export const agentToolNamespaceName = (toolName: string) =>
  agentToolNamespaceByTool.get(toolName)?.name;

/**
 * The instructions' line on the deferred tools: each namespace with the tools
 * it holds, so a tool the instructions name is found by its namespace (the
 * agent harness playbook's deferred-tools pitfall). Built from the namespaces
 * above, so it never drifts from them. OpenAI's search returns an empty list
 * for tools already loaded; the model read that as a missing tool and gave up
 * on two deferred tools in evals.
 *
 * @returns The line.
 */
export const agentDeferredToolsInstructions = () =>
  `These tools are in namespaces that load through tool search: ${agentOfferedToolNamespaces()
    .map(({ name, tools }) => `${name} (${tools.join(", ")})`)
    .join(
      "; "
    )}. When a request needs one, search for it, then call it. Never tell the user you lack a tool before searching. A search loads tools for the rest of the chat and returns only those not loaded yet: an empty result means the tool you need is already loaded, so call it.`;

/**
 * The tools, each rare one in its namespace and loaded only through tool
 * search; the others as they are.
 *
 * @param eagerTools - Domain tools kept loaded for a dedicated interface.
 * @param tools - The agent's tools.
 * @returns The tools, the rare ones deferred.
 */
export const deferRareAgentTools = <TOOLS extends ToolSet>(
  tools: TOOLS,
  eagerTools: readonly string[] = []
): TOOLS =>
  // Only providerOptions gains the OpenAI namespace and deferLoading.
  patchAgentTools(tools, (name, tool) => {
    const namespace = eagerTools.includes(name)
      ? undefined
      : agentToolNamespaceByTool.get(name);

    return namespace === undefined
      ? undefined
      : {
          providerOptions: {
            ...tool.providerOptions,
            openai: {
              ...tool.providerOptions?.openai,
              namespace,
              deferLoading: true,
            },
          },
        };
  });
