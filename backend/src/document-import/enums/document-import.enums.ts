/**
 * Where an imported document came from. Every intake channel — present and
 * future — funnels through DocumentImportService and stamps its source here.
 * The source is traceability metadata only; it does NOT participate in
 * duplicate detection (the same document arriving from two sources is still
 * one document).
 */
export enum DocumentImportSource {
  GMAIL = 'GMAIL',
  MANUAL_UPLOAD = 'MANUAL_UPLOAD',
  CAMERA_UPLOAD = 'CAMERA_UPLOAD',
  API_IMPORT = 'API_IMPORT',
  EMAIL_FORWARDING = 'EMAIL_FORWARDING',
}
