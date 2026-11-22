import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import type { AuthenticatedRequest } from '../../interfaces/authenticated-request.interface';

export const PSU_IP_HEADER = 'X-Psu-IP-Address';
const activity = new AsyncLocalStorage<{ firebaseId: string; ip: string } | undefined>();

export function normalizePsuIp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const ip = value.trim().replace(/^::ffff:(?=\d+\.)/i, '');
  // Zone identifiers describe a local interface, not an end user's address.
  return !ip.includes('%') && isIP(ip) ? ip : undefined;
}

/** Local direct requests trust no forwarding headers. Cloud Run adds one hop.
 * Extra reverse proxies require an explicit, deployment-specific hop count.
 * Never take the leftmost, client-supplied X-Forwarded-For entry blindly.
 */
export function resolvePsuIp(request: AuthenticatedRequest): string | undefined {
  const configured = process.env.FEEZBACK_TRUSTED_PROXY_HOPS;
  const hops = configured === undefined ? (process.env.K_SERVICE ? 1 : 0) : Number(configured);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10 || configured === '') return undefined;
  if (hops === 0) return normalizePsuIp(request.socket?.remoteAddress);
  const forwarded = request.headers?.['x-forwarded-for'];
  if (typeof forwarded !== 'string') return undefined;
  const chain = forwarded.split(',');
  if (chain.length < hops) return undefined;
  return normalizePsuIp(chain[chain.length - hops]);
}

/** Only the verified owner's own session is PSU activity, never view-as/admin. */
export function withFeezbackUserActivity<T>(request: AuthenticatedRequest, operation: () => T): T {
  const user = request.user;
  const owner = user?.firebaseId && user.actorFirebaseId === user.firebaseId &&
    !request.isDelegatedAccess && !request.isAdminImpersonation;
  const ip = owner ? resolvePsuIp(request) : undefined;
  return activity.run(ip ? { firebaseId: user.firebaseId, ip } : undefined, operation);
}

/** Called only by the Feezback HTTP client; tokens, mutations and other users
 * must not reset the activity timer, even inside a foreground request.
 */
export function feeZbackPsuIp(method: string, url: string, baseUrl: string, sub?: string): string | undefined {
  const current = activity.getStore();
  if (!current || method !== 'GET' ||
      ![`${current.firebaseId}_sub`, `${current.firebaseId}_sub_spouse`].includes(sub)) return undefined;
  try {
    const target = new URL(url), base = new URL(baseUrl);
    const prefix = base.pathname.replace(/\/$/, '');
    const expected = `${prefix}/tpp/`;
    if (target.origin !== base.origin || !target.pathname.startsWith(expected)) return undefined;
    const match = decodeURIComponent(target.pathname.slice(expected.length))
      .match(/^v[12]\/users\/([^/]+)\/(consents|accounts|cards)(?:\/|$)/);
    if (match?.[1] !== `${sub}@KNCAXnwXk1`) return undefined;
    return current.ip;
  } catch { return undefined; }
}
