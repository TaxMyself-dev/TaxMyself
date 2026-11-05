import { Chat } from '@ai-sdk/angular';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai';
import type { UIMessage } from 'ai';

/**
 * What the dev chat needs from the app for each request to the agent: the
 * Firebase token and, as the app's other calls send them, the active business
 * and the client an accountant acts for (AuthInterceptor's headers; the AI
 * SDK calls fetch, which the interceptor never sees).
 */
export interface DevAgentRequestAuth {
  token: () => Promise<string | null>;
  businessNumber: () => string | null;
  clientId: () => string | null;
}

/**
 * The context a chat belongs to: the agent's user for the pair (the person
 * signed in, the client they act for), and the business. The backend keys
 * every conversation to it, so a chat keeps sending the context it started
 * in; when the app switches client or business, the page starts a new chat
 * instead of carrying the old one over (DevAgentPage.contextChanged).
 */
export interface DevAgentChatContext {
  agentUserId: string;
  businessNumber: string | null;
  clientId: string | null;
}

/**
 * The request auth of one chat context: the live Firebase token, with the
 * business and client the context was started with.
 */
export const fixedContextAuth = (
  auth: DevAgentRequestAuth,
  context: { businessNumber: string | null; clientId: string | null },
): DevAgentRequestAuth => ({
  token: auth.token,
  businessNumber: () => context.businessNumber,
  clientId: () => context.clientId,
});

/**
 * The headers every agent request carries, as AuthInterceptor sets them for
 * the app's HttpClient calls.
 */
export const devAgentHeaders = async (auth: DevAgentRequestAuth) => {
  const headers: Record<string, string> = {};
  const token = await auth.token();
  const businessNumber = auth.businessNumber();
  const clientId = auth.clientId();

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (businessNumber && /^[\x20-\x7E]*$/.test(businessNumber)) {
    headers['businessnumber'] = businessNumber;
  }
  if (clientId) {
    headers['x-client-user-id'] = clientId;
  }

  return headers;
};

/**
 * One chat with the agent (backend/agent), sent as its template's page sends
 * it: the newest message only, with the user's agent id, the conversation's
 * name and pin, and the language (agent-chat-request.server.ts). After an
 * approval card is answered, the answer continues on its own.
 */
export const createDevAgentChat = (options: {
  apiUrl: string;
  conversationId: string;
  agentUserId: string;
  locale: 'he' | 'en';
  auth: DevAgentRequestAuth;
  onFinish?: () => void;
  onError?: (error: Error) => void;
}) =>
  new Chat<UIMessage>({
    id: options.conversationId,
    generateId: () => crypto.randomUUID(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => options.onFinish?.(),
    onError: (error) => options.onError?.(error),
    transport: new DefaultChatTransport({
      api: `${options.apiUrl}api/agent/chat`,
      headers: async () => await devAgentHeaders(options.auth),
      prepareReconnectToStreamRequest: ({ id }) => ({
        api: `${options.apiUrl}api/agent/chats/${encodeURIComponent(id)}/stream`,
      }),
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          userId: options.agentUserId,
          id,
          message: messages.at(-1),
          conversation: { name: null, pinned: false },
          locale: options.locale,
        },
      }),
    }),
  });
