import { asSchema } from "ai";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { agentInstructions } from "@/agent/core/agent/agent-instructions";
import type {
  UserProfileMemory,
  UserProfileSnapshot,
} from "@/agent/core/ports/profile-memory";
import { noAgentChatPageData } from "@/agent/core/tool-runtime/agent-chat-page-data-port";
import type { AgentToolContext } from "@/agent/core/tool-runtime/agent-tool-context";
import { agentToolCallKey } from "@/agent/core/tool-runtime/agent-tool-idempotency";
import {
  authorizeOnboardingSurface,
  profileConversationBusiness,
} from "@/agent/tools/profile/agent-profile-surface";
import {
  readUserProfileTool,
  updateUserProfileTool,
} from "@/agent/tools/profile/agent-profile-tools";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";

import { unusedEvalBooks } from "../../../../evals/agent/harness/agent-eval-books";
import {
  createAgentEvalSession,
  createEvalOpportunityStore,
  createEvalTaskStore,
} from "../../../../evals/agent/harness/agent-eval-scenario";
import { emptyEvalSettings } from "../../../../evals/agent/harness/agent-eval-settings-fixtures";

const port = {
  read: vi.fn<UserProfileMemory["read"]>(),
  update: vi.fn<UserProfileMemory["update"]>(),
};

const snapshot: UserProfileSnapshot = {
  businessNumber: "111",
  version: { person: 1, business: 2 },
  story: { person: "", business: "" },
  fields: [],
  facts: [],
  missing: [],
};

const context = (source?: string): AgentToolContext => ({
  conversationId: "6f1c2a1e-4444-4a1a-8a1a-444444444444",
  userId: "6f1c2a1e-6666-4a1a-8a1a-666666666666",
  supabase: createAgentEvalSession({}, []),
  settings: emptyEvalSettings,
  tasks: createEvalTaskStore([], []),
  opportunities: createEvalOpportunityStore([], []),
  webSearch: { search: () => Effect.die(new Error("unused")) },
  email: { send: () => Effect.die(new Error("unused")) },
  books: unusedEvalBooks(() => Effect.die(new Error("unused"))),
  pageData: noAgentChatPageData,
  profileMessage: source,
  profileBusiness: "111",
  profileMemory: port,
});

const message = (business?: string): AgentChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  parts:
    business === undefined
      ? [{ type: "text", text: "שלום" }]
      : [
          { type: "text", text: "שלום" },
          {
            type: "data-onboardingContext",
            data: { businessNumber: business },
          },
        ],
});

const update = {
  businessNumber: "111",
  version: { person: 1, business: 2 },
  intent: "share" as const,
  facts: [],
  forgetIds: [],
};

describe("one agent, shared profile", () => {
  it("binds the chosen interface and business for future turns", () => {
    expect(profileConversationBusiness([], "111")).toBe("111");
    expect(profileConversationBusiness([message("111")])).toBe("111");
    expect(profileConversationBusiness([message()])).toBeUndefined();
    expect(() => profileConversationBusiness([message("111")], "222")).toThrow(
      "SURFACE_CONFLICT"
    );
    expect(() => profileConversationBusiness([message()], "111")).toThrow(
      "SURFACE_CONFLICT"
    );
  });

  it("keeps ordinary chat policy and changes only the onboarding policy", () => {
    expect(agentInstructions("he")).toContain(
      "Ordinary chat never starts onboarding questions"
    );
    expect(agentInstructions("he")).toContain("updateUserProfile");
    expect(agentInstructions("he", "111")).toContain("<onboarding_interface>");
    expect(agentInstructions("he", "111")).not.toContain(
      "never ask about the user"
    );
    expect(agentInstructions("he", "111")).toContain("<approvals>");
  });

  it("reads the canonical profile through the same owner-bound port", async () => {
    port.read.mockResolvedValueOnce(snapshot);
    await expect(
      readUserProfileTool.execute?.(
        { businessNumber: "111" },
        { context: context(), toolCallId: "read", messages: [] }
      )
    ).resolves.toStrictEqual(snapshot);
  });

  it("writes exact server-supplied current source and a stable template call id", async () => {
    const ctx = context("לא");
    await updateUserProfileTool.execute?.(update, {
      context: ctx,
      toolCallId: "save",
      messages: [],
    });
    expect(port.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: "לא",
        operationId: agentToolCallKey(ctx.conversationId, "save"),
        extraction: {
          facts: [],
          intent: "share",
          forgetIds: [],
          clarification: null,
        },
      })
    );
  });

  it("routes a legacy need key to flexible memory without making goals required", async () => {
    await updateUserProfileTool.execute?.(
      {
        ...update,
        facts: [
          {
            field: "current_need",
            scope: "person",
            statement: "רוצה להרחיב את העסק",
            value: "הרחבת העסק",
            state: "known",
            change: "add",
            precision: "unknown",
            evidence: "להרחיב את העסק",
          },
        ],
      },
      {
        context: context("רוצה להרחיב את העסק"),
        toolCallId: "need",
        messages: [],
      }
    );
    expect(port.update.mock.lastCall?.[0].extraction).toMatchObject({
      facts: [{ field: null, statement: "רוצה להרחיב את העסק" }],
    });
    expect(agentInstructions("he", "111")).toContain(
      "Needs and goals are optional"
    );
  });

  it("rejects writes without a new source message and writes for another business", async () => {
    await expect(
      updateUserProfileTool.execute?.(update, {
        context: context(),
        toolCallId: "bad",
        messages: [],
      })
    ).rejects.toThrow("NO_SOURCE");
    await expect(
      updateUserProfileTool.execute?.(
        { ...update, businessNumber: "222" },
        { context: context("לא"), toolCallId: "bad2", messages: [] }
      )
    ).rejects.toThrow("BUSINESS_MISMATCH");
  });

  it("accepts omitted inapplicable fields without dropping required date/replacement semantics", async () => {
    const input = {
      businessNumber: "111",
      version: { person: 1, business: 2 },
      intent: "share",
      facts: [
        {
          field: "employees",
          scope: "business",
          statement: "אין עובדים",
          value: "לא",
          state: "known",
          change: "add",
          precision: "unknown",
          evidence: "לא",
        },
      ],
    };

    const parsed = await asSchema(updateUserProfileTool.inputSchema).validate?.(
      input
    );

    expect(parsed?.success).toBeTruthy();

    if (parsed?.success !== true) {
      throw new Error("Profile input validation failed");
    }

    await updateUserProfileTool.execute?.(parsed.value, {
      context: context("לא"),
      toolCallId: "optional_fields",
      messages: [],
    });
    expect(port.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extraction: {
          intent: "share",
          clarification: null,
          forgetIds: [],
          facts: [
            {
              ...input.facts[0],
              replaces: null,
              effectiveDate: null,
              invalidates: [],
              workplaceModes: null,
            },
          ],
        },
      })
    );
  });
});

describe("onboarding interface admin boundary", () => {
  it("fails closed without the host admin check", async () => {
    await expect(
      authorizeOnboardingSurface({ profile: port }, "111")
    ).rejects.toThrow("ADMIN_REQUIRED");
  });

  it("rejects a non-admin before reading profile data", async () => {
    const read = vi.fn<UserProfileMemory["read"]>();
    await expect(
      authorizeOnboardingSurface(
        {
          authorizeOnboarding: vi
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error("Admin required")),
          profile: { ...port, read },
        },
        "111"
      )
    ).rejects.toThrow("Admin required");
    expect(read).not.toHaveBeenCalled();
  });

  it("checks owner scope after the admin check", async () => {
    const read = vi.fn<UserProfileMemory["read"]>().mockResolvedValue(snapshot);
    await authorizeOnboardingSurface(
      {
        authorizeOnboarding: vi.fn<() => Promise<void>>().mockResolvedValue(),
        profile: { ...port, read },
      },
      "111"
    );
    expect(read).toHaveBeenCalledExactlyOnceWith("111");
  });
});
