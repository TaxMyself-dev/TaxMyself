const { test, expect } = require("playwright/test");
const { loadSignupConfig } = require("../config");

test("the verified synthetic user can log in and reach the dashboard", async ({
  page,
}) => {
  const config = loadSignupConfig();
  const browserFailures = [];

  page.on("pageerror", (error) => {
    browserFailures.push(`pageerror: ${error.message}`);
  });
  page.on("response", (response) => {
    const responseUrl = new URL(response.url());
    if (
      [config.webUrl.origin, config.apiUrl.origin].includes(
        responseUrl.origin
      ) &&
      response.status() >= 500
    ) {
      browserFailures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`
      );
    }
  });

  await page.goto(new URL("login", config.webUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".login-page")).toBeVisible();
  await page.locator('input[formcontrolname="userName"]').fill(config.email);
  await page.locator('input[formcontrolname="password"]').fill(config.password);

  const signinResponsePromise = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.origin === config.apiUrl.origin &&
        url.pathname.endsWith("/auth/signin") &&
        url.searchParams.get("freshLogin") === "true"
      );
    },
    { timeout: 60_000 }
  );

  const submit = page
    .locator(".login-form app-p-button")
    .last()
    .getByRole("button");
  await expect(submit).toBeEnabled();
  await submit.click();

  const signinResponse = await signinResponsePromise;
  expect(signinResponse.status()).toBe(200);
  await expect(page).toHaveURL(/\/my-account(?:[?#]|$)/, { timeout: 60_000 });
  await expect(page.locator(".page-wrapper")).toBeVisible();
  expect(browserFailures).toEqual([]);
});
