import { assert, describe, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";

import {
  LangfuseTracing,
  langfuseTracingAllowed,
} from "../../../../src/server/integrations/langfuse-tracing.server";

// KeepInTax's Langfuse rule: development traces go only to a Langfuse on
// this machine; Langfuse Cloud receives them only from production, or on an
// explicit opt-in. A developer's .env holding the cloud keys traces nothing.

const cloud = "https://cloud.langfuse.com";

const integrationsWith = (config: Record<string, string>) =>
  Effect.gen(function* readIntegrations() {
    const { integrations } = yield* LangfuseTracing;

    return integrations.length;
  }).pipe(
    Effect.provide(
      LangfuseTracing.layer.pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config)))
      )
    ),
    Effect.scoped
  );

const keys = {
  LANGFUSE_PUBLIC_KEY: "pk-lf-test",
  LANGFUSE_SECRET_KEY: "sk-lf-test",
};

describe("langfuse tracing target", () => {
  it("allows a local Langfuse anywhere, a remote one only from production or on purpose", () => {
    assert.isTrue(
      langfuseTracingAllowed("http://localhost:3000", "development", false)
    );
    assert.isTrue(
      langfuseTracingAllowed("http://127.0.0.1:3000/", "eval", false)
    );
    assert.isFalse(langfuseTracingAllowed(cloud, "development", false));
    assert.isFalse(langfuseTracingAllowed(cloud, "eval", false));
    // A look-alike host is not this machine.
    assert.isFalse(
      langfuseTracingAllowed(
        "http://localhost.evil.example",
        "development",
        false
      )
    );
    assert.isTrue(langfuseTracingAllowed(cloud, "production", false));
    assert.isTrue(langfuseTracingAllowed(cloud, "development", true));
  });

  it.effect("traces nothing in development with the cloud's keys", () =>
    Effect.gen(function* cloudInDevelopment() {
      assert.strictEqual(
        yield* integrationsWith({ ...keys, LANGFUSE_BASE_URL: cloud }),
        0
      );
      // The default base URL is the cloud's.
      assert.strictEqual(yield* integrationsWith(keys), 0);
    })
  );

  it.effect("traces to a local Langfuse in development", () =>
    Effect.gen(function* localInDevelopment() {
      assert.strictEqual(
        yield* integrationsWith({
          ...keys,
          LANGFUSE_BASE_URL: "http://localhost:3000",
        }),
        1
      );
    })
  );
});
