import { Option, Schema } from "effect";

import { respondToAgentChat } from "@/agent/chat/turn/agent-chat-endpoint.server";
import {
  respondToAgentChatFollowUps,
  respondToAgentChatSteer,
  respondToAgentChatStop,
  respondToAgentChatStream,
} from "@/agent/chat/turn/agent-chat-stream-response.server";
import {
  changeAgentChatConversation,
  deleteAgentChatConversation,
  listAgentChatConversations,
  nameAgentChatConversation,
  readAgentChatConversationMessages,
  searchAgentChatConversations,
} from "@/lib/agent-chat/conversation/agent-chat-persistence";
import { createAgentChatDictationKey } from "@/lib/agent-chat/dictation/agent-chat-dictation-key";
import {
  deleteAgentMemory,
  readAgentMemories,
} from "@/lib/agent-memory/agent-memory-persistence";
import { readAgentSession } from "@/lib/auth/agent-session-persistence";
import {
  markUserNotificationsRead,
  readUserNotifications,
} from "@/lib/notifications/user-notification-persistence";
import {
  changeTaskOpportunityStatus,
  countNewTaskOpportunities,
  readTaskOpportunities,
  readTaskOpportunitiesById,
} from "@/lib/opportunities/task-opportunity-persistence";
import {
  readUserSettings,
  saveUserAppLocale,
  updateUserSetting,
} from "@/lib/settings/user-settings/user-settings-persistence";
import {
  changeTrackingTasks,
  createTrackingTask,
  deleteTrackingTasks,
  readTrackingTaskScanRuns,
  readTrackingTasks,
  saveTrackingTaskOrder,
  updateTrackingTask,
} from "@/lib/tasks/tracking-task-persistence";
import { writeUserPageState } from "@/lib/user-state/user-page-state";
import { runInAgentRequest } from "@/server/runtime/agent-request-context";
import type { AgentRequestUser } from "@/server/runtime/agent-request-identity";
import {
  recordAppRequestEnd,
  runAppRequest,
} from "@/server/runtime/app-runtime.server";
import { ServerFunctionInputError } from "@/server/runtime/server-function";
import type { ServerFunction } from "@/server/runtime/server-function";

import { paraglideMiddleware } from "../paraglide/server.js";

// The agent's HTTP entry: every request under /api/agent, as the template's
// API routes (src/routes/api/agent) and server functions served them. The
// Nest backend's agent module (backend/src/agent-harness) verifies the
// request's Firebase token, turns the Express request into a web Request and
// calls handleAgentHttpRequest with the verified user; the Response goes back
// as it is, streamed.
//
//   POST   /api/agent/chat                      the chat (respondToAgentChat)
//   GET    /api/agent/chats/:id/stream          follow a running answer
//   POST   /api/agent/chats/:id/stop            stop it
//   POST   /api/agent/chats/:id/steer           send a message into it
//   DELETE /api/agent/chats/:id/steer?id=       withdraw one
//   GET    /api/agent/chats/:id/follow-ups      an answer's follow-up questions
//   GET    /api/agent/fn/:name?data=<json>      a server function that reads
//   POST   /api/agent/fn/:name                  one that changes, JSON body

// The server functions the app's pages call (each module's
// createServerFn), by name.
const agentServerFunctions: ReadonlyMap<
  string,
  ServerFunction<never, unknown>
> = new Map(
  Object.entries({
    readAgentSession,
    listAgentChatConversations,
    readAgentChatConversationMessages,
    searchAgentChatConversations,
    changeAgentChatConversation,
    deleteAgentChatConversation,
    nameAgentChatConversation,
    createAgentChatDictationKey,
    readAgentMemories,
    deleteAgentMemory,
    readUserSettings,
    updateUserSetting,
    saveUserAppLocale,
    readUserNotifications,
    markUserNotificationsRead,
    readTaskOpportunities,
    readTaskOpportunitiesById,
    changeTaskOpportunityStatus,
    countNewTaskOpportunities,
    readTrackingTasks,
    createTrackingTask,
    updateTrackingTask,
    deleteTrackingTasks,
    changeTrackingTasks,
    saveTrackingTaskOrder,
    readTrackingTaskScanRuns,
    writeUserPageState,
  })
);

const jsonError = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

// A server function's failure as the page reads it: its `CODE:` and message.
const serverFunctionFailure = (error: Error) => {
  const { message } = error;
  const code = /^(?<code>[A-Z][A-Z0-9_]+):/u.exec(message)?.groups?.code;

  if (error instanceof ServerFunctionInputError) {
    return jsonError(400, code ?? "SERVER_FUNCTION_INVALID_INPUT", message);
  }

  return jsonError(
    code === "USER_STATE_OWNER_CHANGED" ? 401 : 500,
    code ?? "SERVER_FUNCTION_FAILED",
    message
  );
};

const decodeServerFunctionInput = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

// A server function's input: the JSON in ?data= for a read, the JSON body
// for a change; an empty object without one. Text that is not JSON is
// refused as the function's schema refuses a wrong input.
const serverFunctionInput = async (request: Request): Promise<Schema.Json> => {
  const text =
    request.method === "GET"
      ? new URL(request.url).searchParams.get("data")
      : await request.text();

  if (text === null || text === "") {
    return {};
  }

  return Option.getOrThrowWith(
    decodeServerFunctionInput(text),
    () =>
      new ServerFunctionInputError(
        "SERVER_FUNCTION_INVALID_INPUT: the input is not JSON"
      )
  );
};

const serveAgentServerFunction = async (request: Request, name: string) => {
  const fn = agentServerFunctions.get(name);

  if (fn === undefined) {
    return jsonError(
      404,
      "SERVER_FUNCTION_NOT_FOUND",
      `No server function ${name}.`
    );
  }

  if (fn.method !== request.method) {
    return jsonError(405, "SERVER_FUNCTION_METHOD", `Use ${fn.method}.`);
  }

  try {
    const result = await fn.serve(await serverFunctionInput(request));

    return result === undefined
      ? new Response(null, { status: 204 })
      : Response.json(result);
  } catch (error) {
    return serverFunctionFailure(
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

const chatRoute =
  /^\/api\/agent\/chats\/(?<id>[^/]+)\/(?<action>stream|stop|steer|follow-ups)$/u;

const routeAgentRequest = async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/agent/chat" && request.method === "POST") {
    // Run without the request's signal: a disconnect ends neither the
    // answer's preparation nor the answer (respondToAgentChat).
    return await runAppRequest(respondToAgentChat(request));
  }

  const chat = chatRoute.exec(pathname)?.groups;

  if (chat?.id !== undefined) {
    const { id, action } = chat;

    if (action === "stream" && request.method === "GET") {
      // The page leaving ends the following (the request's signal, read
      // inside), never the answer.
      return await runAppRequest(respondToAgentChatStream(request, id));
    }

    if (action === "stop" && request.method === "POST") {
      return await runAppRequest(respondToAgentChatStop(request, id));
    }

    if (
      action === "steer" &&
      (request.method === "POST" || request.method === "DELETE")
    ) {
      return await runAppRequest(respondToAgentChatSteer(request, id));
    }

    if (action === "follow-ups" && request.method === "GET") {
      return await runAppRequest(respondToAgentChatFollowUps(request, id));
    }
  }

  const fn = /^\/api\/agent\/fn\/(?<name>[A-Za-z]+)$/u.exec(pathname)?.groups;

  if (fn?.name !== undefined) {
    return await serveAgentServerFunction(request, fn.name);
  }

  return jsonError(404, "AGENT_ROUTE_NOT_FOUND", "No such agent route.");
};

/**
 * Serves one request under /api/agent for the user the Nest backend verified,
 * in the language the request asks for (paraglide, Accept-Language), and
 * records its metrics once its response starts.
 *
 * @param request - The request, as a web Request.
 * @param user - The verified user (FirebaseAuthGuard's request.user).
 * @returns The response, streamed for the chat.
 */
export const handleAgentHttpRequest = async (
  request: Request,
  user: AgentRequestUser
): Promise<Response> => {
  const started = performance.now();

  const response = await runInAgentRequest(
    request,
    user,
    async () =>
      await paraglideMiddleware(
        request,
        async () => await routeAgentRequest(request)
      )
  );

  runInAgentRequest(request, user, () => {
    recordAppRequestEnd(
      request,
      response,
      (performance.now() - started) / 1000
    );
  });

  return response;
};

export { disposeAppRuntime } from "@/server/runtime/app-runtime.server";
