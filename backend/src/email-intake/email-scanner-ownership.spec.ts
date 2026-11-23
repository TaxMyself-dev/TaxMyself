import { EmailIntakeRunsService } from './email-intake-runs.service';
describe('explicit DEV scanner ownership across ticks', () => {
  const keys = [
    'EMAIL_DEV_EXCLUSIVE_SCANNER',
    'NODE_ENV',
    'COMPOSIO_ENVIRONMENT',
    'DISABLE_SYNCHRONIZE',
  ];
  let saved: Array<string | undefined>;
  beforeEach(() => {
    saved = keys.map((key) => process.env[key]);
    Object.assign(process.env, {
      EMAIL_DEV_EXCLUSIVE_SCANNER: 'true',
      NODE_ENV: 'development',
      COMPOSIO_ENVIRONMENT: 'dev',
      DISABLE_SYNCHRONIZE: 'true',
    });
  });
  afterEach(() =>
    keys.forEach((key, i) =>
      saved[i] === undefined
        ? delete process.env[key]
        : (process.env[key] = saved[i]),
    ),
  );
  function setup(db = 'keepintax-dev') {
    const runner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest.fn(
        async (sql: string): Promise<any[]> =>
          sql.includes('DATABASE()')
            ? [{ db }]
            : sql.includes('GET_LOCK')
            ? [{ acquired: 1 }]
            : sql.includes('IS_USED_LOCK')
            ? [{ owned: 1 }]
            : [{ released: 1 }],
      ),
    };
    const store: any = {
      enabled: () => true,
      db: { createQueryRunner: jest.fn(() => runner) },
      runs: jest.fn(async () => []),
    };
    return {
      runner,
      store,
      service: new EmailIntakeRunsService(
        store,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      ),
    };
  }
  it('keeps the same connection/lock between ticks and releases on shutdown', async () => {
    const t = setup();
    await t.service.tick();
    await t.service.tick();
    expect(t.store.db.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(
      t.runner.query.mock.calls.filter(([sql]) => sql.includes('GET_LOCK')),
    ).toHaveLength(1);
    expect(t.store.runs).toHaveBeenCalledTimes(2);
    expect(t.runner.release).not.toHaveBeenCalled();
    await t.service.onModuleDestroy();
    expect(t.runner.query).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?)', [
      'gmail-durable-scan',
    ]);
    expect(t.runner.release).toHaveBeenCalledTimes(1);
  });
  it('refuses an actual database other than exact DEV before acquiring ownership', async () => {
    const t = setup('wrong-db');
    await expect(t.service.tick()).rejects.toThrow('keepintax-dev');
    expect(t.store.runs).not.toHaveBeenCalled();
    expect(t.runner.release).toHaveBeenCalledTimes(1);
  });
  it('refuses production settings without connecting', async () => {
    const t = setup();
    process.env.NODE_ENV = 'production';
    await expect(t.service.tick()).rejects.toThrow('safe DEV');
    expect(t.runner.connect).not.toHaveBeenCalled();
  });
  it('does not scan when another worker owns the slot', async () => {
    const t = setup();
    t.runner.query.mockImplementation(async (sql: string) =>
      sql.includes('DATABASE()')
        ? [{ db: 'keepintax-dev' }]
        : [{ acquired: 0 }],
    );
    await t.service.tick();
    expect(t.store.runs).not.toHaveBeenCalled();
    expect(t.runner.release).toHaveBeenCalledTimes(1);
  });
  it('stops scanning and discards the connection when ownership is lost', async () => {
    const t = setup();
    await t.service.tick();
    t.runner.query.mockImplementation(async (sql: string) =>
      sql.includes('DATABASE()') ? [{ db: 'keepintax-dev' }] : [{ owned: 0 }],
    );
    await t.service.tick();
    expect(t.store.runs).toHaveBeenCalledTimes(1);
    expect(t.runner.release).toHaveBeenCalledTimes(1);
  });
});
