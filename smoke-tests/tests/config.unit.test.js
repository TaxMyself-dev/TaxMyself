const test = require("node:test");
const assert = require("node:assert/strict");
const {
  endpoint,
  loadApiConfig,
  loadSignupConfig,
  loadSmokeConfig,
  requiredUrl,
} = require("../config");
const { randomLetters } = require("../run-signup-smoke");

test("requires explicit web and API deployment URLs", () => {
  assert.throws(
    () => loadSmokeConfig({}),
    /SMOKE_WEB_URL is required; refusing to guess a deployment URL/
  );
});

test("candidate readiness requires only an explicit API URL", () => {
  const config = loadApiConfig({
    SMOKE_API_URL: "https://candidate.example.com",
  });
  assert.equal(config.apiUrl.toString(), "https://candidate.example.com/");
});

test("requires HTTPS for non-local smoke targets", () => {
  assert.throws(
    () => requiredUrl("SMOKE_WEB_URL", { SMOKE_WEB_URL: "http://example.com" }),
    /must use HTTPS/
  );
});

test("allows explicitly enabled HTTP only for localhost", () => {
  const url = requiredUrl("SMOKE_WEB_URL", {
    SMOKE_WEB_URL: "http://127.0.0.1:4200",
    SMOKE_ALLOW_HTTP_LOCALHOST: "true",
  });
  assert.equal(url.toString(), "http://127.0.0.1:4200/");
});

test("builds endpoints without discarding an API path prefix", () => {
  const base = new URL("https://api.example.com/v1/");
  assert.equal(endpoint(base, "/ready"), "https://api.example.com/v1/ready");
});

test("accepts only a signup identity derived from the guarded run id", () => {
  const signup = loadSignupConfig({
    SMOKE_ENABLE_SIGNUP: "true",
    SMOKE_WEB_URL: "https://web.example.com",
    SMOKE_API_URL: "https://api.example.com",
    SMOKE_RUN_ID: "abcdefghijkl",
    SMOKE_USER_EMAIL: "smoke-test@keepintax.co.il",
    SMOKE_FOLDER_NAME: "Keepintax Smokeabcdefghijkl",
    SMOKE_USER_PASSWORD: "SmokePassword1",
  });
  assert.equal(signup.runId, "abcdefghijkl");
});

test("rejects an unguarded signup email", () => {
  assert.throws(
    () =>
      loadSignupConfig({
        SMOKE_ENABLE_SIGNUP: "true",
        SMOKE_WEB_URL: "https://web.example.com",
        SMOKE_API_URL: "https://api.example.com",
        SMOKE_RUN_ID: "abcdefghijkl",
        SMOKE_USER_EMAIL: "real-user@example.com",
        SMOKE_FOLDER_NAME: "Keepintax Smokeabcdefghijkl",
        SMOKE_USER_PASSWORD: "SmokePassword1",
      }),
    /does not match the guarded smoke identity/
  );
});

test("generates a cleanup-safe alphabetic run id", () => {
  assert.match(randomLetters(), /^[a-z]{16}$/);
});
