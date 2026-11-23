export type AnalysisPurpose =
  | 'GMAIL'
  | 'DOCUMENT'
  | 'TRANSACTION_LINK'
  | 'FORM_FILL';
export type AnalysisState =
  | 'UPLOADING'
  | 'READY'
  | 'PREPARING'
  | 'IN_FLIGHT'
  | 'RESULT_SAVED'
  | 'COMPLETING'
  | 'COMPLETED'
  | 'PASSWORD_REQUIRED'
  | 'BLOCKED'
  | 'UNKNOWN'
  | 'FAILED';
export interface AnalysisUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}
export interface ProviderCapacitySnapshot {
  requestsRemaining?: number;
  inputRemaining?: number;
  outputRemaining?: number;
  blockedUntil?: number;
}
export interface AnalysisOutcome {
  invoices: any[] | null;
  rawResponse: string;
  intakeDecision?: 'accounting' | 'not_accounting' | 'uncertain';
  usage?: AnalysisUsage;
  capacity?: ProviderCapacitySnapshot;
  technicalCode?: string;
}
export interface AnalysisJob {
  id: string;
  sequence: number;
  owner: string;
  business: string;
  actor: string;
  purpose: AnalysisPurpose;
  state: AnalysisState;
  source: string;
  content_hash: string;
  filename: string;
  mime_type: string;
  size: number;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  provider: string;
  model: string;
  policy_version: string;
  capacity_key: string;
  interactive: number;
  context_json: any;
  result_json: any;
  completion_json: any;
  lease_token: string | null;
  lease_expires_at: Date | null;
  attempt_id: string | null;
  claim_id: number | null;
  error_code: string | null;
  attempts: number;
  completion_attempts?: number;
  created_at: Date;
  next_at: Date | null;
  expires_at: Date | null;
}
export interface AnalysisInput {
  bytes: Buffer;
  mimeType: string;
  catalog: any[];
  gmailPolicy: boolean;
  estimatedInput: number;
  estimatedOutput: number;
  timings?: Record<string, number>;
}
export interface DocumentAiProvider {
  readonly id: string;
  analyze(input: AnalysisInput, model: string): Promise<AnalysisOutcome>;
}
export interface AnalysisReceipt {
  queued: true;
  jobId: string;
  state: AnalysisState;
  driveFileId: string | null;
  filename: string;
}
export class AnalysisInputError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export class ProviderRejectedError extends Error {
  constructor(readonly code: string, readonly retryAfterSeconds?: number) {
    super(code);
  }
}
export const analysisContext = (value: any): Record<string, any> =>
  typeof value === 'string' ? JSON.parse(value) : value || {};
