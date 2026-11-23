import { DocumentAiStore } from './document-ai.store';
import { CapacityProfile } from './document-ai.capacity';
const profile: CapacityProfile = {
  provider: 'anthropic',
  model: 'test-model',
  key: 'test-group',
  concurrency: 8,
  rpm: 60,
  itpm: 60000,
  otpm: 6000,
  pdfPageTokens: 1000,
  imageTokens: 1000,
  outputEstimate: 100,
};
describe('document queue DB boundaries (mock only)', () => {
  it('uses a supplied transaction for both reservation and lookup', async () => {
    const db = { query: jest.fn() };
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([{ id: 'job' }]),
    };
    await new DocumentAiStore(db as any).enqueue(
      {
        owner: 'u',
        business: 'b',
        purpose: 'GMAIL',
        source: 'GMAIL',
        hash: 'a'.repeat(64),
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 12,
        policy: 'v1',
      },
      profile,
      manager as any,
    );
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('does not retain an in-memory saved state when the result transaction rolls back', async () => {
    const job: any = {
      id: 'id',
      owner: 'u',
      business: 'b',
      provider: 'anthropic',
      capacity_key: profile.key,
      state: 'IN_FLIGHT',
      lease_token: 'lease',
      reserved_input: 100,
      reserved_output: 10,
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.startsWith('UPDATE document_ai_capacity'))
        throw new Error('commit storage failure');
      if (sql.includes('state_json FROM')) return [{ state_json: null }];
      if (sql.includes('now_ms')) return [{ now_ms: 1000 }];
      if (sql.startsWith('SELECT *')) return [{ ...job }];
      return { affectedRows: 1 };
    });
    const db = { transaction: (fn: any) => fn({ query }) };
    await expect(
      new DocumentAiStore(db as any).saveResult(
        job,
        profile,
        { invoices: [], rawResponse: 'synthetic' },
        {},
      ),
    ).rejects.toThrow('storage unavailable');
    expect(job.state).toBe('IN_FLIGHT');
    expect(job.result_json).toBeUndefined();
  });
  it('scopes status by owner and business and masks missing/foreign records', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    await expect(
      new DocumentAiStore(db as any).get('id', 'owner', 'biz'),
    ).rejects.toThrow('not found');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('owner=? AND business=?'),
      ['id', 'owner', 'biz'],
    );
  });
  it('whitelists updates before touching storage', async () => {
    const db = { query: jest.fn() };
    await expect(
      new DocumentAiStore(db as any).patch({} as any, { owner: 'other' }),
    ).rejects.toThrow('Invalid');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rejects stale lease completion', async () => {
    const db = { query: jest.fn().mockResolvedValue({ affectedRows: 0 }) };
    await expect(
      new DocumentAiStore(db as any).patch(
        { id: 'id', owner: 'u', business: 'b', lease_token: 'old' } as any,
        { state: 'COMPLETED' },
      ),
    ).rejects.toThrow('lease changed');
  });
  it('rejects a different provider budget before reservation', async () => {
    const db = { transaction: jest.fn() };
    await expect(
      new DocumentAiStore(db as any).admit(
        { provider: 'openai', capacity_key: profile.key } as any,
        profile,
        10,
        10,
      ),
    ).rejects.toThrow('Wrong provider');
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('claims capacity atomically and returns no job when all distributed slots are active', async () => {
    const query = jest.fn(async (sql: string) =>
      sql.includes('state_json FROM')
        ? [{ state_json: null }]
        : sql.includes('now_ms')
        ? [{ now_ms: 1000 }]
        : sql.includes('COUNT(*)')
        ? [{ active: 8 }]
        : { affectedRows: 1 },
    );
    const manager = { query };
    const db = { transaction: (fn: any) => fn(manager) };
    expect(await new DocumentAiStore(db as any).claimNext(profile)).toBeNull();
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(query.mock.calls.some(([sql]) => sql.includes('SELECT j.*'))).toBe(
      false,
    );
  });
  it('recovers expired preparation/completion but never replays an in-flight paid attempt', async () => {
    const db = { query: jest.fn().mockResolvedValue({ affectedRows: 1 }) };
    await new DocumentAiStore(db as any).recoverExpired();
    const sqls = db.query.mock.calls.map((x) => x[0]);
    expect(sqls[0]).toContain("state='UNKNOWN'");
    expect(sqls[0]).toContain("state='IN_FLIGHT'");
    expect(sqls[1]).toContain('attempt_id IS NULL');
    expect(sqls[2]).toContain("state='RESULT_SAVED'");
  });
});
