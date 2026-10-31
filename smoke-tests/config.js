function requiredUrl(name, env = process.env) {
  const raw = env[name]?.trim();
  if (!raw) {
    throw new Error(`${name} is required; refusing to guess a deployment URL`);
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }

  const localHttpAllowed =
    env.SMOKE_ALLOW_HTTP_LOCALHOST === "true" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttpAllowed) {
    throw new Error(`${name} must use HTTPS`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${name} must not contain credentials or a URL fragment`);
  }

  parsed.search = "";
  if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
  return parsed;
}

function endpoint(baseUrl, relativePath) {
  return new URL(relativePath.replace(/^\//, ""), baseUrl).toString();
}

function loadSmokeConfig(env = process.env) {
  return {
    webUrl: requiredUrl("SMOKE_WEB_URL", env),
    apiUrl: requiredUrl("SMOKE_API_URL", env),
  };
}

function loadApiConfig(env = process.env) {
  return { apiUrl: requiredUrl("SMOKE_API_URL", env) };
}

function requiredValue(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadSignupConfig(env = process.env) {
  if (env.SMOKE_ENABLE_SIGNUP !== "true") {
    throw new Error("SMOKE_ENABLE_SIGNUP=true is required");
  }
  const runId = requiredValue("SMOKE_RUN_ID", env);
  const email = requiredValue("SMOKE_USER_EMAIL", env).toLowerCase();
  const folderName = requiredValue("SMOKE_FOLDER_NAME", env);
  if (!/^[a-z]{12,32}$/.test(runId)) {
    throw new Error("SMOKE_RUN_ID must contain 12-32 lowercase letters");
  }
  if (email !== "smoke-test@keepintax.co.il") {
    throw new Error(
      "SMOKE_USER_EMAIL does not match the guarded smoke identity"
    );
  }
  if (folderName !== `Keepintax Smoke${runId}`) {
    throw new Error(
      "SMOKE_FOLDER_NAME does not match the guarded smoke identity"
    );
  }

  return {
    ...loadSmokeConfig(env),
    runId,
    email,
    folderName,
    password: requiredValue("SMOKE_USER_PASSWORD", env),
  };
}

module.exports = {
  endpoint,
  loadApiConfig,
  loadSignupConfig,
  loadSmokeConfig,
  requiredUrl,
  requiredValue,
};
