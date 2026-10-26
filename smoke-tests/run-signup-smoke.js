const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { loadSmokeConfig, requiredValue } = require("./config");

function randomLetters(length = 16) {
  return [...randomBytes(length)]
    .map((byte) => String.fromCharCode(97 + (byte % 26)))
    .join("");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal)
        return reject(new Error(`${command} terminated by ${signal}`));
      resolve(code ?? 1);
    });
  });
}

async function main() {
  loadSmokeConfig();
  const cleanupJob = requiredCloudResource("SMOKE_CLEANUP_JOB");
  const verifyJob = requiredCloudResource("SMOKE_VERIFY_JOB");
  const gcpProject = requiredCloudResource("SMOKE_GCP_PROJECT");
  const gcpRegion = requiredCloudResource("SMOKE_GCP_REGION");
  const runId = randomLetters();
  const email = "smoke-test@keepintax.co.il";
  const folderName = `Keepintax Smoke${runId}`;
  const password = `Smoke${randomLetters(14)}1`;
  console.log(`Starting production smoke run ${runId} for ${email}`);
  const playwrightCli = path.join(
    path.dirname(require.resolve("playwright/package.json")),
    "cli.js"
  );
  const testEnv = {
    ...process.env,
    SMOKE_ENABLE_SIGNUP: "true",
    SMOKE_RUN_ID: runId,
    SMOKE_USER_EMAIL: email,
    SMOKE_USER_PASSWORD: password,
    SMOKE_FOLDER_NAME: folderName,
  };

  const gcloud =
    process.env.GCLOUD_BIN ||
    (process.platform === "win32" ? "gcloud.cmd" : "gcloud");
  let primaryError = null;
  try {
    const signupExitCode = await run(
      process.execPath,
      [
        playwrightCli,
        "test",
        "tests/production-readiness.spec.js",
        "tests/production-readonly.spec.js",
        "tests/production-signup.spec.js",
      ],
      { env: testEnv }
    );
    if (signupExitCode !== 0) {
      throw new Error(`Smoke signup failed with exit code ${signupExitCode}`);
    }

    const verifyExitCode = await executeJob(
      gcloud,
      verifyJob,
      gcpProject,
      gcpRegion,
      ["SMOKE_VERIFY_ENABLED=true", `SMOKE_RUN_ID=${runId}`]
    );
    if (verifyExitCode !== 0) {
      throw new Error(
        `Smoke email verification failed with exit code ${verifyExitCode}`
      );
    }

    const loginExitCode = await run(
      process.execPath,
      [playwrightCli, "test", "tests/production-login.spec.js"],
      { env: testEnv }
    );
    if (loginExitCode !== 0) {
      throw new Error(`Smoke login failed with exit code ${loginExitCode}`);
    }
  } catch (error) {
    primaryError = error;
  }

  let cleanupExitCode = 1;
  try {
    cleanupExitCode = await executeJob(
      gcloud,
      cleanupJob,
      gcpProject,
      gcpRegion,
      ["SMOKE_CLEANUP_ENABLED=true", `SMOKE_RUN_ID=${runId}`]
    );
  } catch (cleanupError) {
    throw new Error(`Smoke cleanup could not start: ${cleanupError.message}`);
  }

  if (cleanupExitCode !== 0) {
    throw new Error(`Smoke cleanup failed with exit code ${cleanupExitCode}`);
  }
  if (primaryError) throw primaryError;
}

function executeJob(command, job, project, region, overrides) {
  return run(
    command,
    [
      "run",
      "jobs",
      "execute",
      job,
      "--project",
      project,
      "--region",
      region,
      "--wait",
      "--update-env-vars",
      overrides.join(","),
    ],
    { shell: process.platform === "win32" }
  );
}

function requiredCloudResource(name) {
  const value = requiredValue(name);
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { randomLetters, requiredCloudResource };
