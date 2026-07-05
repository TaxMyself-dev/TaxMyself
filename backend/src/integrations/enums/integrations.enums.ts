/**
 * External providers a KeepInTax user can connect to.
 * Provider-specific logic (OAuth, APIs) lives in later phases — this enum
 * only identifies which provider a user_integrations row belongs to.
 */
export enum IntegrationProvider {
  GOOGLE = 'GOOGLE',
  MICROSOFT = 'MICROSOFT',
  DROPBOX = 'DROPBOX',
  ONEDRIVE = 'ONEDRIVE',
}

export enum IntegrationStatus {
  /** Connection is live and its refresh token is expected to work. */
  ACTIVE = 'ACTIVE',
  /** User disconnected, or the provider reported the grant was revoked. */
  REVOKED = 'REVOKED',
  /** Refresh token stopped working (e.g. expired / invalid_grant). */
  EXPIRED = 'EXPIRED',
}
