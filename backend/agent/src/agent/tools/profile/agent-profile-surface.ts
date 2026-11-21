import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { AgentDomain } from "@/server/runtime/agent-domain";

/**
 * Resolves the server-bound interface from stored messages.
 * @param history - Previously stored server-validated messages.
 * @param requested - Explicit interface business requested by the page.
 * @returns The bound business, or undefined for ordinary chat.
 */
export const profileConversationBusiness = (
  history: readonly AgentChatMessage[],
  requested?: string
): string | undefined => {
  const stored = history.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === "data-onboardingContext" ? [part.data.businessNumber] : []
    )
  );

  const [business] = stored;
  const inconsistentHistory = stored.some((value) => value !== business);

  const changedBusiness =
    business !== undefined && requested !== undefined && business !== requested;

  const changedInterface =
    business === undefined && history.length > 0 && requested !== undefined;

  if (inconsistentHistory || changedBusiness || changedInterface) {
    throw new Error(
      "AGENT_CHAT_SURFACE_CONFLICT: Start a separate conversation for this interface/business."
    );
  }

  return business ?? requested;
};

/**
 * Authorizes the dedicated interface before reading any profile data.
 * @param domain - The verified request's host callbacks.
 * @param business - Explicit owned business selected for onboarding.
 * @returns Completion only after persisted admin and owner checks succeed.
 */
export const authorizeOnboardingSurface = async (
  domain: Pick<AgentDomain, "authorizeOnboarding" | "profile"> | undefined,
  business: string
): Promise<void> => {
  if (!domain?.authorizeOnboarding) {
    throw new Error("AGENT_ONBOARDING_ADMIN_REQUIRED");
  }

  await domain.authorizeOnboarding();

  if (!domain.profile) {
    throw new Error("AGENT_PROFILE_UNAVAILABLE");
  }

  await domain.profile.read(business);
};
