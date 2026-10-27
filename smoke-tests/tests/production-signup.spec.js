const { test, expect } = require("playwright/test");
const { endpoint, loadSignupConfig } = require("../config");
const { selectInput, textInput } = require("../registration-locators");

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

  await textInput(page, "שם פרטי").fill("Keepintax");
  await textInput(page, "שם משפחה").fill(`Smoke${config.runId}`);
  await textInput(page, "תעודת זהות").fill("000000018");
  await textInput(page, "כתובת אימייל").fill(config.email);
  await textInput(page, "מספר פלאפון").fill("0500000000");
  await textInput(page, "סיסמה").fill(config.password);
  await textInput(page, "אימות סיסמה").fill(config.password);

  const familyStatus = selectInput(page, "מצב משפחתי");
  await familyStatus.click();
  await page.getByRole("option", { name: "רווק/ה", exact: true }).click();

  const employmentStatus = selectInput(page, "סטטוס תעסוקתי");
  await employmentStatus.click();
  await page.getByRole("option", { name: "שכיר/ה", exact: true }).click();

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
