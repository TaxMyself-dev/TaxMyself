import { DocumentAiStore } from './document-ai.store';
const profile: any = {
  key: 'test',
  provider: 'anthropic',
  concurrency: 2,
  rpm: 60,
  itpm: 200000,
  otpm: 100000,
};
/** Simulated transaction serialization, not a replacement for real MySQL contention acceptance. */
function database() {
  const rows = Array.from({ length: 9 }, (_, i) => ({
    id: String(i),
    owner: 'owner',
    business: 'business',
    state: 'RESULT_SAVED',
    lease_token: null,
    completion_attempts: 0,
  }));
  let chain = Promise.resolve();
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('state_json FROM')) return [{ state_json: null }];
    if (sql.includes('now_ms')) return [{ now_ms: 1000 }];
    if (sql.includes('COUNT(*)')) {
      expect(params).toEqual([]);
      return [{ active: rows.filter((r) => !!r.lease_token).length }];
    }
    if (sql.startsWith('SELECT *')) {
      expect(sql).toContain('capacity_key=?');
      expect(sql).toContain(
        '(lease_token IS NULL OR lease_expires_at<UTC_TIMESTAMP(3))',
      );
      expect(sql).toContain('next_at<=UTC_TIMESTAMP(3)');
      expect(params).toEqual(['test']);
      return rows
        .filter((r) => r.state === 'RESULT_SAVED' && !r.lease_token)
        .slice(0, 1)
        .map((r) => ({ ...r }));
    }
    if (sql.startsWith('UPDATE document_processing_jobs')) {
      const row = rows.find((r) => r.id === params[1]);
      row.state = 'COMPLETING';
      row.lease_token = params[0];
      return { affectedRows: 1 };
    }
    return [];
  });
  const db: any = {
    query,
    transaction: (fn: any) => {
      const result = chain.then(() => fn({ query }));
      chain = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  return { db, query, rows };
}
describe('distributed Scheduler claims (mock DB)', () => {
  it('bounds overlapping stores to two total completion tasks and unique claims', async () => {
    const t = database(),
      a = new DocumentAiStore(t.db),
      b = new DocumentAiStore(t.db);
    const result = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? a : b).claimCompletion(profile),
      ),
    );
    const claimed = result.filter(Boolean);
    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((j) => j.id)).size).toBe(2);
    expect(t.rows.filter((r) => r.state === 'COMPLETING')).toHaveLength(2);
    const locks = t.query.mock.calls.map((c) => c[0]);
    expect(
      locks.findIndex(
        (s) =>
          s.includes('__document_analysis_admission__') &&
          s.includes('FOR UPDATE'),
      ),
    ).toBeLessThan(locks.findIndex((s) => s.includes('COUNT(*)')));
    expect(locks.find((s) => s.includes('COUNT(*)'))).not.toContain(
      'capacity_key=?',
    );
  });
  it('counts leased saved results and completions against new AI preparation capacity', async () => {
    const t = database();
    t.rows[0].lease_token = 'live-result';
    t.rows[1].lease_token = 'live-completion';
    t.rows[1].state = 'COMPLETING';
    const store = new DocumentAiStore(t.db);
    expect(await store.claimNext(profile)).toBeNull();
    expect(
      t.query.mock.calls.find((c) => c[0].includes('COUNT(*)'))[0],
    ).toContain("'RESULT_SAVED','COMPLETING'");
  });
  it('leaves paid orphans UNKNOWN, safely recovers preparation/completion and bounds each recovery update', async () => {
    const query = jest.fn().mockResolvedValue({ affectedRows: 0 });
    await new DocumentAiStore({ query } as any).recoverExpired();
    const sql = query.mock.calls.map((c) => c[0]);
    expect(sql).toHaveLength(4);
    expect(sql.every((s) => s.endsWith('LIMIT 100'))).toBe(true);
    expect(sql[0]).toContain("SET state='UNKNOWN'");
    expect(sql[0]).toContain("WHERE state='IN_FLIGHT'");
    expect(sql[1]).toContain('attempt_id IS NULL');
    expect(sql[2]).toContain("SET state='RESULT_SAVED'");
  });

  it('revalidates cleanup due time and ownership after a stale overlapping discovery', async () => {
    const query = jest.fn().mockResolvedValue({ affectedRows: 0 });
    expect(
      await new DocumentAiStore({ query } as any).claimCleanup({
        id: 'job',
        owner: 'owner',
        business: 'business',
      } as any),
    ).toBeNull();
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('next_at<=UTC_TIMESTAMP(3)');
    expect(sql).toContain('id=? AND owner=? AND business=?');
    expect(sql).toContain("purpose='FORM_FILL'");
    expect(sql).toContain('expires_at<UTC_TIMESTAMP(3)');
    expect(sql).toContain('lease_expires_at<UTC_TIMESTAMP(3)');
    expect(params.slice(1)).toEqual(['job', 'owner', 'business']);
  });
});
