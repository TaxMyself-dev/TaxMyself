import type { Schema } from "effect";

// The template's server functions (TanStack Start's createServerFn) as the
// agent package serves them: the same builder (createServerFn with a method,
// then validator(schema), then handler(fn)), so each *-persistence.ts module
// keeps its code; the agent's HTTP entry (agent-http.server.ts) serves each
// one at /api/agent/fn/<name> for the app's pages, validating its input with
// the function's schema first, as TanStack does.

// A Standard Schema's answer: the value, or the issues that refused it.
type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly { readonly message: string }[] };

// What a server function validates its input with: a Standard Schema, as
// toStandardSchema makes one from an Effect Schema. Its input is whatever
// the request sent (JSON) or what server code passes.
interface StandardSchemaV1<Output> {
  readonly "~standard": {
    readonly validate: (
      value: Schema.Json | Output
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  };
}

/**
 * A server function's refused input. Its message,
 * `SERVER_FUNCTION_INVALID_INPUT: …`, names the schema's issues.
 */
export class ServerFunctionInputError extends Error {
  override readonly name = "ServerFunctionInputError";
}

/**
 * A server function: callable from the server as TanStack's are (with its
 * data), and served over HTTP with its method.
 */
export interface ServerFunction<Input, Output> {
  (options: { data: Input }): Promise<Output>;
  readonly method: "GET" | "POST";
  // Validates an untrusted input (an HTTP request's JSON) and runs the
  // function.
  readonly serve: (input: Schema.Json) => Promise<Output>;
}

const validateInput = async <Input>(
  schema: StandardSchemaV1<Input>,
  input: Schema.Json | Input
): Promise<Input> => {
  const result = await schema["~standard"].validate(input);

  if (result.issues !== undefined) {
    const issues = result.issues.map((issue) => issue.message).join("; ");

    throw new ServerFunctionInputError(
      `SERVER_FUNCTION_INVALID_INPUT: ${issues}`
    );
  }

  return result.value;
};

/**
 * Builds a server function: its method, its input's schema, then its
 * handler.
 *
 * @param options - method: GET for reads, POST for changes.
 * @returns The builder.
 */
export const createServerFn = (options: { method: "GET" | "POST" }) => ({
  validator: <Input>(schema: StandardSchemaV1<Input>) => ({
    handler: <Output>(
      handler: (context: { data: Input }) => Promise<Output>
    ): ServerFunction<Input, Output> => {
      const call = async ({ data }: { data: Input }) =>
        await handler({ data: await validateInput(schema, data) });

      return Object.assign(call, {
        method: options.method,
        serve: async (input: Schema.Json) =>
          await handler({ data: await validateInput(schema, input) }),
      });
    },
  }),
});
