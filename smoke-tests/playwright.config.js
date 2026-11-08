const { defineConfig } = require("playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: /production-.*\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "artifacts/report" }],
  ],
  outputDir: "artifacts/results",
  use: {
    browserName: "chromium",
    channel: process.env.SMOKE_BROWSER_CHANNEL || "chrome",
    headless: true,
    ignoreHTTPSErrors: false,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
