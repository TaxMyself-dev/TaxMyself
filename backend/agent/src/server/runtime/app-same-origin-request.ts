import { isNonEmptyText } from "../../../backend/shared/text/non-empty-text";

// The app's own pages: the request's own origin, and in KeepInTax the
// origins the Angular app is served from, which call the API on another
// host (AGENT_APP_ORIGINS, comma-separated, such as
// "https://app.keepintax.co.il,http://localhost:4200").
const appOrigins = () =>
  (process.env.AGENT_APP_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/u, ""))
    .filter((origin) => origin !== "");

/**
 * Whether a request comes from the app's own pages: its Origin, when sent, is
 * the app's, and the browser calls it same-origin (Sec-Fetch-Site), or it is
 * one of the app's own origins (AGENT_APP_ORIGINS). The cross-site request
 * guard for the agent's API routes; a request with neither header (a server
 * or curl) passes it, and the route's sign-in check decides.
 *
 * @param request - The request.
 * @returns Whether to serve it.
 */
export const isAppSameOriginRequest = (request: Request) => {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");

  if (isNonEmptyText(origin) && appOrigins().includes(origin)) {
    return true;
  }

  return !(
    (isNonEmptyText(origin) && origin !== new URL(request.url).origin) ||
    (isNonEmptyText(site) && !["same-origin", "none"].includes(site))
  );
};
