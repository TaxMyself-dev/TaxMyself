import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { isAppSameOriginRequest } from "@/server/runtime/app-same-origin-request";
import {
  createServerFn,
  ServerFunctionInputError,
} from "@/server/runtime/server-function";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";

// The pieces that stand in for TanStack Start in KeepInTax: the server
// functions' builder (createServerFn) and the cross-site guard with the
// Angular app's own origins.

describe("server functions", () => {
  const double = createServerFn({ method: "POST" })
    .validator(toStandardSchema(Schema.Struct({ value: Schema.Finite })))
    .handler(async ({ data }) => await Promise.resolve(data.value * 2));

  it("validate their input before the handler runs, from the server and over HTTP", async () => {
    assert.strictEqual(double.method, "POST");
    assert.strictEqual(await double({ data: { value: 2 } }), 4);
    assert.strictEqual(await double.serve({ value: 3 }), 6);

    try {
      await double.serve({ value: "three" });
      assert.fail("an invalid input ran");
    } catch (error) {
      assert.instanceOf(error, ServerFunctionInputError);
      assert.match(String(error), /SERVER_FUNCTION_INVALID_INPUT/u);
    }
  });
});

const request = (headers: Record<string, string>) =>
  new Request("https://api.keepintax.test/api/agent/chat", { headers });

describe("app origin guard", () => {
  it("passes the API's own origin, a server's request, and the app's listed origins", () => {
    process.env.AGENT_APP_ORIGINS =
      "https://app.keepintax.test, http://localhost:4200/";

    assert.isTrue(isAppSameOriginRequest(request({})));
    assert.isTrue(
      isAppSameOriginRequest(
        request({
          origin: "https://api.keepintax.test",
          "sec-fetch-site": "same-origin",
        })
      )
    );
    assert.isTrue(
      isAppSameOriginRequest(
        request({
          origin: "https://app.keepintax.test",
          "sec-fetch-site": "same-site",
        })
      )
    );
    assert.isTrue(
      isAppSameOriginRequest(
        request({
          origin: "http://localhost:4200",
          "sec-fetch-site": "cross-site",
        })
      )
    );
  });

  it("turns away any other site", () => {
    process.env.AGENT_APP_ORIGINS = "https://app.keepintax.test";

    assert.isFalse(
      isAppSameOriginRequest(
        request({
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        })
      )
    );
    assert.isFalse(
      isAppSameOriginRequest(request({ "sec-fetch-site": "cross-site" }))
    );
  });
});
