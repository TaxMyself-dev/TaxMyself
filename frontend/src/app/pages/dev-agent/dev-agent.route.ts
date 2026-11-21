import { environment } from 'src/environments/environment';

/**
 * Where the AI agent's dev chat lives and whether it exists in this build.
 * Kept apart from the page so the routing module and the admin panel can
 * read it without loading the chat itself.
 */
export const DEV_AGENT_PATH = 'dev/agent';

// The route exists only where the environment turns it on (local
// development and the explicit dev-cloud build); never in production builds.
export const devAgentRouteEnabled = (): boolean =>
  (environment as { agentDevPage?: boolean }).agentDevPage === true;

// The query value the admin panel passes so the chat offers a way back.
export const DEV_AGENT_FROM_ADMIN = 'admin-panel';

/**
 * The local backend given as ?api= (several worktrees' backends run side by
 * side, e.g. ?api=http://localhost:3011/), or null when it is missing or not
 * local. Only a local backend may stand in for the app's: the chat sends it
 * the signed-in user's Firebase token.
 */
export const devAgentApiOverride = (value: string | null | undefined): string | null => {
  if (value && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\/?$/.test(value)) {
    // Nest listens on IPv4 locally; avoid localhost's IPv6 fallback delay.
    const local = value.replace('http://localhost:', 'http://127.0.0.1:');
    return local.endsWith('/') ? local : `${local}/`;
  }

  return null;
};
