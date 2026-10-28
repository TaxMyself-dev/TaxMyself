const { test, expect } = require("playwright/test");
const { endpoint, loadApiConfig } = require("../config");

test("the exact deployed backend revision is ready", async ({ request }) => {
  const { apiUrl } = loadApiConfig();
  const response = await request.get(endpoint(apiUrl, "/ready"), {
    headers: { "Cache-Control": "no-cache" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const readiness = await response.json();
  expect(readiness).toMatchObject({
    status: "ready",
    revision: expect.any(String),
    checks: {
      database: "ok",
      databaseTarget: "ok",
      signupSchema: "ok",
    },
  });
});
