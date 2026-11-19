import { EmailIntakeRunsService } from './email-intake-runs.service';
const saved = { ...process.env };
beforeEach(() => {
  process.env.GMAIL_DURABLE_SCAN_ENABLED = 'true';
});
afterEach(() => {
  if (saved.GMAIL_DURABLE_SCAN_ENABLED === undefined)
    delete process.env.GMAIL_DURABLE_SCAN_ENABLED;
  else
    process.env.GMAIL_DURABLE_SCAN_ENABLED = saved.GMAIL_DURABLE_SCAN_ENABLED;
});
function simulation() {
  const run: any = {
    id: 'run',
    firebase_id: 'owner',
    business_number: '123',
    integration_id: 17,
    query_text: 'frozen range',
    scan_state: 'READY',
    pull_state: 'RUNNING',
    started_at: new Date(),
  };
  const rows: any[] = [];
  let active = 0,
    maxActive = 0;
  const hashes = new Map();
  const store: any = {
    enabled: () => true,
    runs: async () => [run],
    leaseRun: jest.fn(async () =>
      run.lease_token ? '' : (run.lease_token = 'lease'),
    ),
    query: jest.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith('SELECT * FROM email_import_runs')) return [run];
      if (sql.startsWith('UPDATE email_import_runs SET lease_token')) {
        run.lease_token = null;
        return { affectedRows: 1 };
      }
      if (
        sql.startsWith('UPDATE email_import_runs SET integration_finalized_at')
      ) {
        run.integration_finalized_at = new Date();
        return { affectedRows: 1 };
      }
      throw new Error('Unexpected SQL');
    }),
    savePage: async (_r: any, _t: string, ids: string[], next: string) => {
      for (const id of ids)
        if (
          !rows.some((r) => r.message_id === id && r.part_path === '@message')
        )
          rows.push({
            id: id + '-message',
            message_id: id,
            part_path: '@message',
            state: 'DISCOVERED',
          });
      run.page_token = next;
      run.scan_state = next ? 'PAGING' : 'DONE';
    },
    items: async (_id: string, kind: string, limit: number) =>
      rows
        .filter(
          (r) =>
            (kind === 'message'
              ? r.part_path === '@message'
              : r.part_path !== '@message') &&
            ['DISCOVERED', 'RETRY'].includes(r.state),
        )
        .slice(0, limit),
    recordParts: async (_r: any, _t: string, item: any, parts: any[]) => {
      for (const p of parts)
        if (
          !rows.some(
            (r) => r.message_id === item.message_id && r.part_path === p.path,
          )
        )
          rows.push({
            id: item.message_id + p.path,
            message_id: item.message_id,
            part_path: p.path,
            state: 'DISCOVERED',
            filename: p.filename,
            mime_type: p.mimeType,
          });
      item.state = 'SCANNED';
    },
    finishItem: async (
      _r: any,
      _t: string,
      item: any,
      state: string,
      id: number,
    ) => Object.assign(item, { state, imported_document_id: id }),
    retryItem: async (_r: any, _t: string, item: any) => (item.state = 'RETRY'),
    summary: async () => ({ messages: count(true), attachments: count(false) }),
    refreshRun: async () => {
      if (
        run.scan_state === 'DONE' &&
        !rows.some((r) => ['DISCOVERED', 'RETRY'].includes(r.state))
      )
        run.pull_state = 'COMPLETE';
      return { pull: run.pull_state };
    },
  };
  function count(message: boolean) {
    const result: any = {};
    rows
      .filter((r) => (r.part_path === '@message') === message)
      .forEach((r) => (result[r.state] = (result[r.state] || 0) + 1));
    return result;
  }
  const reader: any = {
    durablePage: jest.fn(async (_i: any, _q: string, cursor: string) => {
      const start = Number(cursor || 0);
      return {
        ids: Array.from({ length: Math.min(50, 150 - start) }, (_, i) =>
          String(start + i),
        ),
        nextPageToken: start + 50 < 150 ? String(start + 50) : undefined,
      };
    }),
    durableParts: async () =>
      [0, 1].map((i) => ({
        path: 'root.' + i,
        filename: 'part.pdf',
        mimeType: 'application/pdf',
      })),
    durableDownload: async (_i: any, id: string, path: string) =>
      Buffer.from(String((Number(id) * 2 + Number(path.slice(-1))) % 250)),
  };
  const storage: any = {
    accept: jest.fn(async (_r: any, _i: any, content: Buffer) => {
      active++;
      maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setImmediate(resolve));
      const key = content.toString(),
        duplicate = hashes.has(key);
      if (!duplicate) hashes.set(key, hashes.size + 1);
      active--;
      return { id: hashes.get(key), duplicate };
    }),
  };
  const integrations: any = {
    findOwnedByIdOrThrow: async () => ({
      firebaseId: 'owner',
      status: 'ACTIVE',
    }),
    markSyncSuccess: jest.fn(),
  };
  const create = () =>
    new EmailIntakeRunsService(store, reader, integrations, {} as any, storage);
  return {
    run,
    rows,
    store,
    reader,
    storage,
    integrations,
    create,
    hashes,
    max: () => maxActive,
  };
}
describe('durable Gmail scan continuation (no providers/DB)', () => {
  it('handles 300 attachments across pages with bounded work, restart and content dedup', async () => {
    const t = simulation();
    let worker = t.create();
    let steps = 0;
    while (t.run.pull_state !== 'COMPLETE' && steps < 400) {
      await worker.step(t.run);
      if (++steps === 60) worker = t.create();
    }
    expect(t.run.pull_state).toBe('COMPLETE');
    expect(t.rows.filter((r) => r.part_path !== '@message')).toHaveLength(300);
    expect(t.hashes.size).toBe(250);
    expect(t.rows.filter((r) => r.state === 'DUPLICATE')).toHaveLength(50);
    expect(t.reader.durablePage).toHaveBeenCalledTimes(3);
    expect(t.max()).toBeLessThanOrEqual(2);
    expect(t.integrations.markSyncSuccess).toHaveBeenCalledTimes(1);
  });
  it('retries a failed file from a persisted item instead of silently losing it', async () => {
    const t = simulation();
    t.storage.accept.mockRejectedValueOnce(new Error('transient'));
    let steps = 0;
    while (t.run.pull_state !== 'COMPLETE' && steps++ < 400)
      await t.create().step(t.run);
    expect(t.run.pull_state).toBe('COMPLETE');
    expect(t.hashes.size).toBe(250);
    expect(t.rows.some((r) => r.state === 'RETRY')).toBe(false);
  });
  it('does no work when the scanner flag is off', async () => {
    delete process.env.GMAIL_DURABLE_SCAN_ENABLED;
    const t = simulation();
    await t.create().step(t.run);
    expect(t.store.leaseRun).not.toHaveBeenCalled();
    expect(t.reader.durablePage).not.toHaveBeenCalled();
  });
});

it('releases the scanner connection and permits the next tick after unlock failure', async () => {
  const t = simulation();
  let fail = true;
  const release = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('GET_LOCK')) return [{ acquired: 1 }];
    if (fail) {
      fail = false;
      throw new Error('connection lost');
    }
    return [];
  });
  t.store.db = {
    createQueryRunner: () => ({ connect: async () => {}, query, release }),
  };
  t.store.runs = async () => [];
  const scanner = t.create();
  await expect(scanner.tick()).rejects.toThrow('connection lost');
  await scanner.tick();
  expect(release).toHaveBeenCalledTimes(2);
});
it('does not read run state or call Gmail when another scanner holds the global slot', async () => {
  const t = simulation();
  t.store.db = {
    createQueryRunner: () => ({
      connect: async () => {},
      query: async () => [{ acquired: 0 }],
      release: async () => {},
    }),
  };
  t.store.runs = jest.fn();
  await t.create().tick();
  expect(t.store.runs).not.toHaveBeenCalled();
  expect(t.reader.durablePage).not.toHaveBeenCalled();
});

it('reconciles completed pull after a crash before integration finalization without downloading files', async () => {
  const t = simulation();
  Object.assign(t.run, {
    scan_state: 'DONE',
    pull_state: 'COMPLETE',
    sync_type: 'INITIAL',
    from_date: '2026-09-01',
    to_date: '2026-09-30',
  });
  const download=jest.spyOn(t.reader, 'durableDownload');
  await t.create().step(t.run);
  expect(t.integrations.markSyncSuccess).toHaveBeenCalledWith(
    17,
    expect.objectContaining({
      lastSuccessfulSyncAt: new Date('2026-10-01T00:00:00Z'),
    }),
  );
  expect(t.run.integration_finalized_at).toBeInstanceOf(Date);
  expect(t.reader.durablePage).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
});
