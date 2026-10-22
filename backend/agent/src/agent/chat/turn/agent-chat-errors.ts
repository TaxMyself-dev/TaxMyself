import { APICallError, RetryError } from "ai";
import { Option, Schema } from "effect";

import {
  app_agent_error_auth,
  app_agent_error_busy,
  app_agent_error_failed,
  app_agent_error_generic,
  app_agent_error_invalid,
  app_agent_error_key,
  app_agent_error_rate,
  app_agent_error_retry_unsafe,
  app_agent_error_too_long,
} from "#/paraglide/messages";
import type { AppLocale } from "@/lib/i18n/app-intl-locale";

import { isNonEmptyText } from "../../../../backend/shared/text/non-empty-text";

const agentChatRequestErrorSchema = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, message: Schema.String }),
});

// The endpoint's refusal, which the AI SDK passes on as the error's message;
// none for a stream error, whose message is already plain text.
const decodeAgentChatRequestError = Schema.decodeUnknownOption(
  Schema.fromJsonString(agentChatRequestErrorSchema)
);

/**
 * What the chat shows for a refused chat request, and whether it can be tried
 * again.
 *
 * @param error - The request's error, its message the endpoint's JSON refusal.
 * @returns The message and whether retrying may help.
 */
export const agentChatRequestFailure = (error: Error) => {
  const code = Option.getOrUndefined(decodeAgentChatRequestError(error.message))
    ?.error.code;

  if (code === "AGENT_CHAT_RETRY_UNSAFE") {
    return {
      message: app_agent_error_retry_unsafe(),
      retry: false,
    };
  }

  if (code === "AGENT_CHAT_BUSY") {
    return {
      message: app_agent_error_busy(),
      retry: true,
    };
  }

  if (code === "AGENT_AUTH_REQUIRED") {
    return {
      message: app_agent_error_auth(),
      retry: false,
    };
  }

  if (code === "AGENT_INVALID_INPUT") {
    return {
      message: app_agent_error_invalid(),
      retry: false,
    };
  }

  return {
    message: isNonEmptyText(code) ? app_agent_error_failed() : error.message,
    retry: true,
  };
};

// What the chat tells the user when an answer fails, by kind of failure, as
// Grok's sampler classifies errors: each message says what to do next. The
// AI SDK has already retried the request (twice, with backoff) by then.

/**
 * Whatever the stream failed with; the AI SDK passes it untyped.
 */
export type AgentChatAnswerFailure = Parameters<
  typeof RetryError.isInstance
>[0];

const agentChatModelError = (
  error: AgentChatAnswerFailure
): APICallError | null => {
  if (RetryError.isInstance(error)) {
    return agentChatModelError(error.lastError);
  }

  return APICallError.isInstance(error) ? error : null;
};

/**
 * Written on the server, so in the language the chat request named (locale).
 *
 * @param error - Whatever the answer failed with.
 * @param locale - The chat's language.
 * @returns The message for the user.
 */
export const agentChatErrorMessage = (
  error: AgentChatAnswerFailure,
  locale: AppLocale
) => {
  const inLocale = { locale };
  const failure = agentChatModelError(error);

  if (failure?.statusCode === 429) {
    return app_agent_error_rate({}, inLocale);
  }

  if (failure?.statusCode === 401 || failure?.statusCode === 403) {
    return app_agent_error_key({}, inLocale);
  }

  if (failure?.responseBody?.includes("context_length_exceeded") === true) {
    return app_agent_error_too_long({}, inLocale);
  }

  return app_agent_error_generic({}, inLocale);
};
