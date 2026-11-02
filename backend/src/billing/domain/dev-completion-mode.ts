import { ServiceUnavailableException } from '@nestjs/common';

/** Opt-in local worker profile. Normal application behavior is unchanged. */
export function isDevCompletionOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BILLING_DEV_COMPLETION_ONLY === 'true';
}

export function assertDevCompletionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.BILLING_DEV_COMPLETION_ONLY && !['true', 'false'].includes(env.BILLING_DEV_COMPLETION_ONLY)) {
    throw new Error('BILLING_DEV_COMPLETION_ONLY must be true or false');
  }
  if (!isDevCompletionOnly(env)) return;
  if (env.DB_DATABASE !== 'keepintax-dev' || env.BILLING_TASKS_PROJECT_ID !== 'keepintax-dev' ||
    env.BILLING_TASKS_EXPECTED_DATABASE !== 'keepintax-dev' || env.DISABLE_SYNCHRONIZE !== 'true' ||
    env.SKIP_BOOT_SEED !== 'true') {
    throw new Error('Dev completion worker requires keepintax-dev, disabled synchronize and skipped boot seed');
  }
}

export function devCompletionScheduleOptions() {
  return isDevCompletionOnly() ? { cronJobs: false, intervals: false, timeouts: false } : {};
}

export function assertCardcomNetworkAllowed(): void {
  if (isDevCompletionOnly()) throw new ServiceUnavailableException('CardCom network access is disabled in the local completion worker');
}

export function isAllowedDevCompletionRequest(method: string, requestPath: string): boolean {
  if (!isDevCompletionOnly()) return true;
  return ((method === 'GET' || method === 'HEAD') && ['/', '/ready'].includes(requestPath)) ||
    method === 'OPTIONS' || (method === 'POST' && ['/internal/billing/completion', '/internal/billing/repair'].includes(requestPath));
}
