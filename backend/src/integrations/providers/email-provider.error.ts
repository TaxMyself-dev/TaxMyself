export class EmailProviderError extends Error {
  constructor(public readonly category: 'AUTH' | 'RATE_LIMIT' | 'TRANSIENT' | 'NOT_FOUND' | 'CONTRACT' | 'CONFIG') {
    super(`Email provider failure: ${category}`);
  }
}
