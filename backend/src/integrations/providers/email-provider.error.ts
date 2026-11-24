export type EmailProviderErrorCategory = 'AUTH' | 'ACCESS' | 'RATE_LIMIT' | 'TRANSIENT' | 'NOT_FOUND' | 'CONTRACT' | 'CONFIG';
export interface EmailFailureDetails { httpStatus?: number; providerCode?: string; }
export class EmailProviderError extends Error {
  constructor(public readonly category: EmailProviderErrorCategory, public readonly details: EmailFailureDetails = {}) {
    super(`Email provider failure: ${category}`);
  }
}
