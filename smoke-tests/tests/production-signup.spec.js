const { test, expect } = require("playwright/test");
const { endpoint, loadSignupConfig } = require("../config");

test("a synthetic user can complete the deployed registration flow", async ({
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

  await page.goto(endpoint(config.webUrl, "/register"), {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".register-screen")).toBeVisible();

  await page.locator('input[formcontrolname="fName"]').fill("Keepintax");
  await page
    .locator('input[formcontrolname="lName"]')
    .fill(`Smoke${config.runId}`);
  await page.locator('input[formcontrolname="id"]').fill("000000018");
  await page.locator('input[formcontrolname="email"]').fill(config.email);
  await page.locator('input[formcontrolname="phone"]').fill("0500000000");
  await page.locator('input[formcontrolname="password"]').fill(config.password);
  await page
    .locator('input[formcontrolname="confirmPassword"]')
    .fill(config.password);

  const familyStatus = page.locator('p-select[formcontrolname="familyStatus"]');
  await familyStatus.click();
  await page.getByRole("option", { name: "רווק/ה" }).click();

  const employmentStatus = page.locator(
    'p-select[formcontrolname="employmentStatus"]'
  );
  await employmentStatus.click();
  await page.getByRole("option", { name: "שכיר/ה" }).click();

  const signupRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url() === endpoint(config.apiUrl, "/auth/signup"),
    { timeout: 45_000 }
  );
  const signupResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() === endpoint(config.apiUrl, "/auth/signup"),
    { timeout: 45_000 }
  );

  const submit = page
    .locator(".footer .buttons-footer app-p-button")
    .nth(1)
    .getByRole("button");
  await expect(submit).toBeEnabled();
  await submit.click();

  const signupRequest = await signupRequestPromise;
  const signupResponse = await signupResponsePromise;
  expect(signupResponse.status()).toBe(201);
  expect(signupRequest.postDataJSON()).toMatchObject({
    personal: {
      firebaseId: expect.any(String),
      fName: "Keepintax",
      lName: `Smoke${config.runId}`,
      email: config.email,
      employmentStatus: "EMPLOYEE",
      familyStatus: "SINGLE",
    },
    business: { businessArray: [] },
  });
  await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
  expect(browserFailures).toEqual([]);
});
