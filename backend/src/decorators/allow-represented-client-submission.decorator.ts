import { SetMetadata } from '@nestjs/common';

/**
 * Marks a self-service operation that carries EXPENSES_APPROVE only for an
 * impersonated accountant's scope check, but is not itself an accounting
 * decision (submission, OCR, classification draft, or report preparation).
 */
export const ALLOW_REPRESENTED_CLIENT_SUBMISSION_KEY =
  'allowRepresentedClientSubmission';

export const AllowRepresentedClientOperation = () =>
  SetMetadata(ALLOW_REPRESENTED_CLIENT_SUBMISSION_KEY, true);

export const AllowRepresentedClientSubmission = AllowRepresentedClientOperation;
