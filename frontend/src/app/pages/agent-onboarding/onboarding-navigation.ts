export const ONBOARDING_PATH = "/agent/onboarding";
export const ONBOARDING_MENU_ITEM = {
  label: "ההיכרות שלי עם הסוכן",
  routerLink: ONBOARDING_PATH,
};
export function canOfferOnboarding(context: {
  uid: string | null | undefined;
  clientId: string | null;
  url: string;
  loading: boolean;
  billingBlocked: boolean;
}) {
  const path = context.url.split("?")[0];
  return (
    !!context.uid &&
    !context.clientId &&
    !context.loading &&
    !context.billingBlocked &&
    !!path &&
    !["/login", "/register"].includes(path) &&
    ![
      "/agent/onboarding",
      "/dev/agent",
      "/billing",
      "/mfa",
      "/referral-consent",
    ].some((prefix) => path.startsWith(prefix))
  );
}
export function onboardingMenuItems(
  uid: string | null | undefined,
  clientId: string | null
) {
  return uid && !clientId ? [ONBOARDING_MENU_ITEM] : [];
}
