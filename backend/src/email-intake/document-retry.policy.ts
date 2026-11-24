/** Never turn ambiguous paid work into a fresh provider call. */
export type RetryPlan =
  | 'READY'
  | 'SAVED_RESULT'
  | 'EXISTING_RESULT'
  | 'ALREADY_ACTIVE'
  | 'UNKNOWN_OUTCOME'
  | 'NOT_RETRYABLE'
  | 'PASSWORD_REQUIRED';
export function savedOutcome(value: any): boolean {
  try {
    const result = typeof value === 'string' ? JSON.parse(value) : value;
    return (
      !!result &&
      (Array.isArray(result.invoices) || result.invoices === null) &&
      result.technicalCode !== 'AI_UNKNOWN_OUTCOME'
    );
  } catch {
    return false;
  }
}
export function documentRetryPlan(
  work: any,
  jobs: any[],
  claims: any[],
): RetryPlan {
  if (
    work &&
    (work.email_decision === 'NOT_ACCOUNTING' ||
      work.email_deleted_at ||
      [
        'DELETED',
        'DELETE_PENDING',
        'DELETE_RETRY',
        'DELETE_UNCONFIRMED',
        'REPLACED',
      ].includes(work.email_work_state))
  )
    return 'NOT_RETRYABLE';
  if (
    work?.email_work_state === 'PASSWORD_REQUIRED' ||
    jobs.some((j) => j.state === 'PASSWORD_REQUIRED')
  )
    return 'PASSWORD_REQUIRED';
  if (
    (work && work.email_work_state !== 'WORK_BLOCKED') ||
    jobs.some(
      (j) =>
        ['READY', 'UPLOADING', 'PREPARING', 'IN_FLIGHT', 'COMPLETING'].includes(
          j.state,
        ) || j.live_lease,
    )
  )
    return 'ALREADY_ACTIVE';
  if (
    claims.some(
      (c) =>
        c.deleted_at ||
        [
          'approved',
          'archived',
          'rejected',
          'paired',
          'not_an_expense',
        ].includes(c.status),
    )
  )
    return 'NOT_RETRYABLE';
  if (
    jobs.some(
      (j) => j.state === 'UNKNOWN' || j.error_code === 'AI_UNKNOWN_OUTCOME',
    ) ||
    ['UNKNOWN', 'IN_FLIGHT'].includes(work?.email_ai_state) ||
    work?.email_error_code === 'AI_UNKNOWN_OUTCOME'
  )
    return 'UNKNOWN_OUTCOME';
  // A durable result resumes persistence; it is never sent to the provider again.
  if (
    savedOutcome(work?.email_result_json) ||
    jobs.some((j) => j.state !== 'COMPLETED' && savedOutcome(j.result_json))
  )
    return 'SAVED_RESULT';
  if (
    claims.length &&
    claims.every((c) => c.status === 'pending_review') &&
    claims.some((c) => !!c.raw_response)
  )
    return 'EXISTING_RESULT';
  if (
    claims.length ||
    work?.email_ai_attempt_id ||
    jobs.some((j) => j.attempt_id || j.state === 'COMPLETED') ||
    (work?.email_ai_state && work.email_ai_state !== 'NOT_SENT')
  )
    return 'UNKNOWN_OUTCOME';
  return work || jobs.some((j) => ['BLOCKED', 'FAILED'].includes(j.state))
    ? 'READY'
    : 'NOT_RETRYABLE';
}
