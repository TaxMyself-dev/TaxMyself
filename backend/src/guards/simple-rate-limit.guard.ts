import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Type,
  mixin,
} from '@nestjs/common';

export interface SimpleRateLimitOptions {
  /** Sliding window size in milliseconds. */
  windowMs: number;
  /** Max requests per IP per window before a 429 is thrown. */
  max: number;
}

/**
 * Minimal in-memory, per-process rate limiter — no external dependency.
 * Keyed by (controller, handler, IP), so unrelated rate-limited routes never
 * share a bucket. Resets on process restart and does not coordinate across
 * multiple instances; acceptable here since this app runs as a single Cloud
 * Run instance and the guarded routes are low-risk (non-enumerable slugs),
 * not the primary defense against abuse.
 *
 * Usage: @UseGuards(SimpleRateLimitGuard({ windowMs: 60_000, max: 30 }))
 */
export function SimpleRateLimitGuard(options: SimpleRateLimitOptions): Type<CanActivate> {
  @Injectable()
  class SimpleRateLimitGuardMixin implements CanActivate {
    private static readonly buckets = new Map<string, { count: number; resetAt: number }>();

    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest();
      const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
      const key = `${context.getClass().name}:${context.getHandler().name}:${ip}`;
      const now = Date.now();

      const bucket = SimpleRateLimitGuardMixin.buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        SimpleRateLimitGuardMixin.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        return true;
      }

      if (bucket.count >= options.max) {
        throw new HttpException('Too many requests — please try again later.', HttpStatus.TOO_MANY_REQUESTS);
      }

      bucket.count++;
      return true;
    }
  }

  return mixin(SimpleRateLimitGuardMixin);
}
