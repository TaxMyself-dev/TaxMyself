import { Chat } from '@ai-sdk/angular';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai';
import type { UIMessage } from 'ai';

import { devAgentShouldContinue } from './dev-agent-chat-parts';

export * from './dev-agent-chat-parts';

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
 * signed in, the client they act for). The backend keys every conversation
 * to the pair, so a chat keeps sending the client it started with; when the
 * app switches client, the page starts a new chat instead of carrying the
 * old one over (DevAgentPage.contextChanged). The active business is not
 * part of it: one conversation covers any of the client's businesses, and
 * each request carries the business active at the time, the tools' default.
 */
export interface DevAgentChatContext {
  agentUserId: string;
  clientId: string | null;
}

/**
 * The request auth of one chat context: the live Firebase token and active
 * business, with the client the context was started with.
 */
export const fixedContextAuth = (
  auth: DevAgentRequestAuth,
  context: { clientId: string | null },
): DevAgentRequestAuth => ({
  token: auth.token,
  businessNumber: auth.businessNumber,
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
 * Calls one of the agent's server functions (GET /api/agent/fn/:name?data=,
 * or POST with a JSON body), with the request's auth headers.
 */
export const callDevAgentFunction = async (
  apiUrl: string,
  auth: DevAgentRequestAuth,
  name: string,
  data: Record<string, unknown>,
  method: 'GET' | 'POST' = 'GET',
): Promise<unknown> => {
  const headers = await devAgentHeaders(auth);
  const url =
    method === 'GET'
      ? `${apiUrl}api/agent/fn/${name}?data=${encodeURIComponent(JSON.stringify(data))}`
      : `${apiUrl}api/agent/fn/${name}`;
  const response = await fetch(url, {
    method,
    headers: method === 'POST' ? { ...headers, 'content-type': 'application/json' } : headers,
    ...(method === 'POST' && { body: JSON.stringify(data) }),
  });

  if (!response.ok) {
    throw new Error(`${name}: ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? null : await response.json();
};

/**
 * A stored conversation's messages, as readAgentChatConversationMessages
 * returns them (its JSON text, validated by the server).
 */
export const readDevAgentConversation = async (
  apiUrl: string,
  auth: DevAgentRequestAuth,
  agentUserId: string,
  conversationId: string,
): Promise<UIMessage[]> => {
  const text = await callDevAgentFunction(apiUrl, auth, 'readAgentChatConversationMessages', {
    userId: agentUserId,
    conversationId,
  });

  return typeof text === 'string' ? (JSON.parse(text) as UIMessage[]) : [];
};

/**
 * An answer's follow-up questions (GET /api/agent/chats/:id/follow-ups), once
 * the server has written them; none when it wrote none.
 */
export const fetchDevAgentFollowUps = async (
  apiUrl: string,
  auth: DevAgentRequestAuth,
  conversationId: string,
  messageId: string,
): Promise<string[]> => {
  const response = await fetch(
    `${apiUrl}api/agent/chats/${encodeURIComponent(conversationId)}/follow-ups?message=${encodeURIComponent(messageId)}`,
    { headers: await devAgentHeaders(auth) },
  );
  const body = response.ok ? ((await response.json()) as { questions?: unknown }) : {};

  return Array.isArray(body.questions) ? body.questions.filter((q): q is string => typeof q === 'string') : [];
};

/**
 * One chat with the agent (backend/agent), sent as its template's page sends
 * it: the newest message only, with the user's agent id, the conversation's
 * name and pin, and the language (agent-chat-request.server.ts). After an
 * approval card is decided or a question's button pressed, the answer
 * continues on its own. A stored conversation starts from its messages.
 * A pressed follow-up is sent with origin "follow-up" (request body), which
 * the server records only when the text is one of the stored follow-ups.
 */
export const createDevAgentChat = (options: {
  apiUrl: string;
  conversationId: string;
  agentUserId: string;
  locale: 'he' | 'en';
  auth: DevAgentRequestAuth;
  messages?: UIMessage[];
  // The question calls answered on this page, waiting to be sent.
  pendingAnswers?: Set<string>;
  onFinish?: () => void;
  onError?: (error: Error) => void;
  onData?: (part: { type: string }) => void;
}) => {
  const pending = options.pendingAnswers ?? new Set<string>();

  return new Chat<UIMessage>({
    id: options.conversationId,
    messages: options.messages ?? [],
    generateId: () => crypto.randomUUID(),
    sendAutomaticallyWhen: ({ messages }) =>
      devAgentShouldContinue(messages, pending, lastAssistantMessageIsCompleteWithApprovalResponses({ messages })),
    onFinish: () => options.onFinish?.(),
    onError: (error) => options.onError?.(error),
    onData: (part) => options.onData?.(part),
    transport: new DefaultChatTransport({
      api: `${options.apiUrl}api/agent/chat`,
      headers: async () => await devAgentHeaders(options.auth),
      prepareReconnectToStreamRequest: ({ id }) => ({
        api: `${options.apiUrl}api/agent/chats/${encodeURIComponent(id)}/stream`,
      }),
      prepareSendMessagesRequest: ({ id, messages, body }) => ({
        body: {
          userId: options.agentUserId,
          id,
          message: messages.at(-1),
          conversation: { name: null, pinned: false },
          locale: options.locale,
          ...(body?.['origin'] === 'follow-up' && { origin: 'follow-up' }),
        },
      }),
    }),
  });
};
