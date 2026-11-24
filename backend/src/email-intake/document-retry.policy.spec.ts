import {
  documentRetryPlan as plan,
  savedOutcome,
} from './document-retry.policy';
const blocked = () => ({
  email_work_state: 'WORK_BLOCKED',
  email_ai_state: 'NOT_SENT',
});
describe('safe document retry decisions', () => {
  it('reuses multi-invoice results whose raw response is stored on the primary claim',()=>expect(plan(blocked(),[],[{status:'pending_review',raw_response:'saved'},{status:'pending_review',raw_response:null}])).toBe('EXISTING_RESULT'));

  it('releases never-sent work', () =>
    expect(plan(blocked(), [], [])).toBe('READY'));
  it.each(['READY', 'UPLOADING', 'PREPARING', 'IN_FLIGHT', 'COMPLETING'])(
    'does not duplicate %s',
    (state) => expect(plan(blocked(), [{ state }], [])).toBe('ALREADY_ACTIVE'),
  );
  it('respects live leases', () =>
    expect(plan(blocked(), [{ state: 'BLOCKED', live_lease: 1 }], [])).toBe(
      'ALREADY_ACTIVE',
    ));
  it.each(['UNKNOWN', 'IN_FLIGHT'])(
    'preserves uncertain email state %s',
    (email_ai_state) =>
      expect(plan({ ...blocked(), email_ai_state }, [], [])).toBe(
        'UNKNOWN_OUTCOME',
      ),
  );
  it('retains unknown provider jobs', () =>
    expect(plan(blocked(), [{ state: 'UNKNOWN' }], [])).toBe(
      'UNKNOWN_OUTCOME',
    ));
  it('retains a paid attempt without result', () =>
    expect(
      plan(blocked(), [{ state: 'BLOCKED', attempt_id: 'paid' }], []),
    ).toBe('UNKNOWN_OUTCOME'));
  it.each(['error', 'processing'])(
    'does not repeat an ambiguous %s claim',
    (status) =>
      expect(plan(blocked(), [], [{ status }])).toBe('UNKNOWN_OUTCOME'),
  );
  it('reuses existing reviewed extraction', () =>
    expect(
      plan(
        blocked(),
        [],
        [{ status: 'pending_review', raw_response: 'saved' }],
      ),
    ).toBe('EXISTING_RESULT'));
  it('resumes saved output without another call', () =>
    expect(
      plan({ ...blocked(), email_result_json: { invoices: [] } }, [], []),
    ).toBe('SAVED_RESULT'));
  it('resumes job persistence after a paid attempt', () =>
    expect(
      plan(
        blocked(),
        [
          {
            state: 'RESULT_SAVED',
            attempt_id: 'paid',
            result_json: { invoices: [] },
          },
        ],
        [],
      ),
    ).toBe('SAVED_RESULT'));
  it.each(['approved', 'archived', 'rejected', 'paired', 'not_an_expense'])(
    'preserves %s',
    (status) => expect(plan(blocked(), [], [{ status }])).toBe('NOT_RETRYABLE'),
  );
  it('preserves deleted claims', () =>
    expect(
      plan(blocked(), [], [{ status: 'pending_review', deleted_at: 'date' }]),
    ).toBe('NOT_RETRYABLE'));
  it.each([
    'DELETED',
    'DELETE_PENDING',
    'DELETE_RETRY',
    'DELETE_UNCONFIRMED',
    'REPLACED',
  ])('preserves retention state %s', (email_work_state) =>
    expect(plan({ ...blocked(), email_work_state }, [], [])).toBe(
      'NOT_RETRYABLE',
    ),
  );
  it('keeps password handling separate', () =>
    expect(
      plan({ ...blocked(), email_work_state: 'PASSWORD_REQUIRED' }, [], []),
    ).toBe('PASSWORD_REQUIRED'));
  it('can retry a manual job before a paid call', () =>
    expect(plan(null, [{ state: 'BLOCKED' }], [])).toBe('READY'));
  it('does not reopen completed analysis blindly', () =>
    expect(
      plan(null, [{ state: 'COMPLETED', result_json: { invoices: [] } }], []),
    ).toBe('UNKNOWN_OUTCOME'));
  it('does not accept malformed/unknown saved output', () => {
    expect(savedOutcome('{bad')).toBe(false);
    expect(savedOutcome({})).toBe(false);
    expect(
      savedOutcome({ invoices: null, technicalCode: 'AI_UNKNOWN_OUTCOME' }),
    ).toBe(false);
  });
});
