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
