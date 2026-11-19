import {
  canOfferOnboarding,
  onboardingMenuItems,
  ONBOARDING_PATH,
} from "./onboarding-navigation";
describe("onboarding application navigation policy", () => {
  const owner = {
    uid: "alice",
    clientId: null,
    url: "/my-account",
    loading: false,
    billingBlocked: false,
  };
  it("offers onboarding on ordinary authenticated entry routes", () => {
    expect(canOfferOnboarding(owner)).toBeTrue();
    expect(
      canOfferOnboarding({ ...owner, url: "/transactions?tab=bank" })
    ).toBeTrue();
  });
  it("waits for authentication and hides in represented accounts", () => {
    expect(canOfferOnboarding({ ...owner, uid: null })).toBeFalse();
    expect(canOfferOnboarding({ ...owner, clientId: "client" })).toBeFalse();
  });
  it("does not compete with startup, payment or onboarding screens", () => {
    expect(canOfferOnboarding({ ...owner, loading: true })).toBeFalse();
    expect(canOfferOnboarding({ ...owner, billingBlocked: true })).toBeFalse();
    for (const url of [
      "/login",
      "/register",
      "/billing/payment-status",
      ONBOARDING_PATH,
      "/dev/agent",
      "/mfa/setup",
    ])
      expect(canOfferOnboarding({ ...owner, url })).toBeFalse();
  });
  it("provides a permanent owner-only link to the normal application route", () => {
    expect(onboardingMenuItems("alice", null)[0].routerLink).toBe(
      ONBOARDING_PATH
    );
    expect(onboardingMenuItems("alice", "client")).toEqual([]);
    expect(onboardingMenuItems(null, null)).toEqual([]);
  });
});
