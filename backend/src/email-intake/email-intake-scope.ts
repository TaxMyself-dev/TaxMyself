import { ForbiddenException } from '@nestjs/common';
/** Optional rollout bounds. They restrict scope; they never rewrite ownership or routing. */
export function assertEmailIntakeScope(
  integrationId: number,
  businessNumber?: string,
): void {
  const configured = process.env.GMAIL_DURABLE_ALLOWED_INTEGRATION_IDS;
  if (configured !== undefined) {
    const ids = configured.split(',').map((value) => value.trim());
    if (
      !ids.length ||
      ids.some((value) => !/^[1-9]\d*$/.test(value)) ||
      !ids.includes(String(integrationId))
    ) {
      throw new ForbiddenException(
        'Mailbox is outside the enabled intake scope',
      );
    }
  }
  const business = process.env.GMAIL_DURABLE_REQUIRED_BUSINESS_NUMBER;
  if (
    business !== undefined &&
    businessNumber !== undefined &&
    (!business.trim() || businessNumber !== business.trim())
  ) {
    throw new ForbiddenException(
      'Business is outside the enabled intake scope',
    );
  }
}

/** Optional local UI test guard: never usable against another database/environment. */
export function emailIntakeDevTestQuery(): string | null {
  const subject = process.env.GMAIL_DURABLE_DEV_TEST_SUBJECT;
  if (subject === undefined) return null;
  if (process.env.DB_DATABASE !== 'keepintax-dev' || process.env.COMPOSIO_ENVIRONMENT !== 'dev' || process.env.NODE_ENV === 'production' || !/^KEEPINTAX-DEV-[A-Z0-9-]{8,80}$/.test(subject))
    throw new Error('Invalid DEV-only Gmail test scope');
  return 'has:attachment subject:"' + subject + '"';
}
