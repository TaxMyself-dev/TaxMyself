const { test, expect } = require("playwright/test");
const { endpoint, loadSmokeConfig } = require("../config");

test("deployed registration UI loads and uses the expected backend", async ({
  page,
}) => {
  const { webUrl, apiUrl } = loadSmokeConfig();
  const browserFailures = [];
  const criticalOrigins = new Set([webUrl.origin, apiUrl.origin]);

  page.on("pageerror", (error) => {
    browserFailures.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserFailures.push(`console.error: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    const responseUrl = new URL(response.url());
    if (criticalOrigins.has(responseUrl.origin) && response.status() >= 500) {
      browserFailures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`
      );
    }
  });

  await test.step("the deployed registration page loads and calls the expected API origin", async () => {
    const citiesResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/auth/get-cities"),
      { timeout: 30_000 }
    );

    const navigation = await page.goto(endpoint(webUrl, "/register"), {
      waitUntil: "domcontentloaded",
    });
    expect(navigation?.status()).toBeLessThan(500);

    const citiesResponse = await citiesResponsePromise;
    expect(new URL(citiesResponse.url()).origin).toBe(apiUrl.origin);
    expect(citiesResponse.status()).toBeLessThan(500);
    expect(Array.isArray(await citiesResponse.json())).toBe(true);

    await expect(page.locator(".register-screen")).toBeVisible();
    await expect(page.locator("app-input-text").first()).toBeVisible();
  });

  await expect.poll(() => browserFailures, { timeout: 2_000 }).toEqual([]);
});
