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

/**
 * Progress/outcome of the most recent sync run for an integration
 * (initial manual Gmail import or the nightly incremental sync).
 * Null on the integration row = no sync has ever been attempted.
 */
export enum IntegrationSyncStatus {
  /** A sync run is currently in progress. */
  RUNNING = 'RUNNING',
  /** The last sync run completed successfully. */
  SUCCESS = 'SUCCESS',
  /** The last sync run failed — see lastSyncError. */
  ERROR = 'ERROR',
}

export enum IntegrationStatus {
  /** Connection is live and its refresh token is expected to work. */
  ACTIVE = 'ACTIVE',
  /** User disconnected, or the provider reported the grant was revoked. */
  REVOKED = 'REVOKED',
  /** Refresh token stopped working (e.g. expired / invalid_grant). */
  EXPIRED = 'EXPIRED',
}
